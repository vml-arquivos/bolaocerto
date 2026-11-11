import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  buildCaixaSources,
  calculateBrazilCutoff,
  CaixaAttempt,
  CaixaContestPayload,
  CaixaFetchError,
  CaixaSourceHealth,
  fetchCaixaContest,
  MODALIDADES_LOTERIA,
  ModalidadeLoteria,
  normalizeCaixaContestPayload,
  parseCaixaDate,
  resolveCaixaTimeout,
  adoptProvisionalContests,
  FestaTx,
  FESTAS_PRESETS,
  proximoSorteioFesta,
  provisionalContestNumber,
  brazilDayKey,
  ensureUpcomingContests,
  ensureUpcomingContestsSoon,
  FONTE_PROJETADA,
} from '@bolaocerto/shared-types';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateFestaContestDto, CreateManualContestDto, UpdateFestaContestDto } from './lotteries.dto';

/** Fecha as apostas no horário padrão da modalidade ou 1 hora antes do sorteio, o que vier primeiro (sorteios de manhã). */
function festivalCutoff(drawDate: Date, horarioCorteLocal: string): Date {
  const standard = calculateBrazilCutoff(drawDate, horarioCorteLocal);
  const beforeDraw = new Date(drawDate.getTime() - 60 * 60 * 1000);
  return standard.getTime() <= beforeDraw.getTime() ? standard : beforeDraw;
}

@Injectable()
export class LotteriesService {
  private readonly health = new CaixaSourceHealth();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, @Optional() private readonly audit?: AuditService) {}

  /**
   * Lista pública. Sem filtro (ou status=aberto) devolve só os concursos realmente abertos (prazo no futuro), do mais próximo
   * para o mais distante. Com outro status devolve o histórico, do mais recente para o mais antigo.
   */
  async list(modalidade?: string, status?: string, tipo?: string) {
    const allowed = modalidade ? this.assertModalidade(modalidade) : undefined;
    const openOnly = !status || status === 'aberto';
    if (openOnly) await ensureUpcomingContestsSoon(this.prisma, calculateBrazilCutoff);
    // Festa com número oficial da CAIXA (ex.: Mega da Virada) é concurso aberto de verdade e entra na lista normal.
    // Festa ainda provisória (sem número oficial) só aparece quando pedida (tipo=festa ou tipo=todos).
    const kind: Prisma.ConcursoWhereInput = tipo === 'festa' ? { especial: { not: null } } : tipo === 'todos' ? {} : openOnly ? { OR: [{ especial: null }, { numeroDefinido: true }] } : {};
    const contests = await this.prisma.concurso.findMany({
      where: {
        ...(allowed ? { modalidade: allowed } : {}),
        ...kind,
        ...(openOnly ? { status: 'aberto', cutoffAt: { gt: new Date() } } : { status }),
      },
      orderBy: [{ dataSorteio: openOnly ? 'asc' : 'desc' }, { modalidade: 'asc' }],
      take: 100,
    });
    return contests.map((contest) => this.toPublicContest(contest));
  }

  /** Fecha os concursos abertos cujo prazo já passou. Retorna quantos foram fechados. */
  async closeExpired(): Promise<number> {
    const result = await this.prisma.concurso.updateMany({ where: { status: 'aberto', cutoffAt: { lte: new Date() } }, data: { status: 'fechado' } });
    return result.count;
  }

  async getById(id: string) {
    const contest = await this.prisma.concurso.findUniqueOrThrow({ where: { id } });
    return this.toPublicContest(contest);
  }

  async getResult(id: string) {
    const result = await this.prisma.resultado.findUniqueOrThrow({ where: { concursoId: id }, include: { concurso: true } });
    return {
      concursoId: result.concursoId,
      modalidade: result.concurso.modalidade,
      numeroConcurso: result.concurso.numeroConcurso,
      numerosSorteados: result.numerosSorteados,
      listaRateioPremio: result.listaRateioPremio,
      apuradoEm: result.apuradoEm,
    };
  }

  async sync(modalidade?: string): Promise<{ sincronizados: number; fontes: string[]; falhas: Array<{ modalidade: string; erro: string }> }> {
    const modalities = modalidade ? [this.assertModalidade(modalidade)] : [...MODALIDADES_LOTERIA];
    const fontes = new Set<string>();
    const falhas: Array<{ modalidade: string; erro: string }> = [];
    let sincronizados = 0;
    await this.closeExpired();

    for (const current of modalities) {
      const config = await this.prisma.configLoteria.findUnique({ where: { modalidade: current } });
      if (!config) continue;
      try {
        const { payload, source } = await this.fetchFromCaixa(current);
        await this.persistContestPayload(current, config.horarioCorteLocal, payload, source);
        fontes.add(source);
        sincronizados += 1;
        if (payload.numeroConcursoProximo) await this.lookahead(current, config.horarioCorteLocal, payload.numeroConcursoProximo).catch(() => 0);
        // Festas já abertas na CAIXA para datas mais distantes (ex.: Mega da Virada em dezembro/janeiro).
        const nextDraw = parseCaixaDate(payload.dataProximoConcurso);
        if (payload.numeroConcursoProximo && nextDraw) await this.syncFestivals(current, config.horarioCorteLocal, payload.numeroConcursoProximo, nextDraw).catch(() => 0);
      } catch (error) {
        falhas.push({ modalidade: current, erro: error instanceof Error ? error.message : 'falha desconhecida' });
      }
    }

    await this.closeExpired();
    // Modalidade sem concurso aberto (a CAIXA ainda não publicou o seguinte, ou está fora do ar) recebe o concurso previsto.
    try { await ensureUpcomingContests(this.prisma as never, calculateBrazilCutoff, new Date(), this.upcomingHorizon()); } catch { /* melhor esforço */ }

    // Uma modalidade com problema não derruba as demais; só falha por inteiro se nada foi sincronizado.
    if (sincronizados === 0 && falhas.length > 0) {
      const first = falhas[0]!;
      throw new ServiceUnavailableException(`Não foi possível sincronizar: ${first.erro}${falhas.length > 1 ? ` (+${falhas.length - 1} modalidade(s) com falha)` : ''}. Use "Testar conexão com a CAIXA" para ver o diagnóstico.`);
    }
    return { sincronizados, fontes: [...fontes], falhas };
  }

  /** Quantos sorteios futuros (por modalidade) o sistema mantém prontos para criar bolão. */
  private upcomingHorizon(): number {
    const value = Number(this.config.get<string>('CONCURSOS_PREVISTOS_A_FRENTE') ?? 3);
    return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1), 6) : 3;
  }

  /**
   * Depois do "próximo concurso" que a CAIXA informa, pergunta pelos números seguintes. Se a CAIXA já tiver o concurso
   * (número e data no futuro, sem resultado), ele entra na lista com a data oficial. Nunca altera concurso que já exista
   * e não seja previsto, e qualquer falha é ignorada: o calendário previsto cobre o que faltar.
   */
  private async lookahead(modalidade: ModalidadeLoteria, horarioCorteLocal: string, nextNumber: number): Promise<number> {
    const extra = Math.min(Math.max(Math.trunc(Number(this.config.get<string>('CAIXA_CONCURSOS_A_FRENTE') ?? 8)) || 0, 0), 10);
    const sources = this.caixaSources();
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    let added = 0;
    for (let step = 1; step <= extra; step += 1) {
      const numero = nextNumber + step;
      try {
        const { payload, source } = await fetchCaixaContest(modalidade, sources, { timeoutMs, retries: 0, contestNumber: numero, userAgent: this.config.get<string>('CAIXA_USER_AGENT'), health: this.health });
        const data = normalizeCaixaContestPayload(payload);
        const drawDate = parseCaixaDate(data.dataApuracao);
        const drawn = (data.dezenasSorteadasOrdemSorteio ?? data.listaDezenas ?? []).length > 0;
        if (data.numero !== numero || !drawDate || drawn || drawDate.getTime() <= Date.now()) break;
        const existing = await this.prisma.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: numero } } });
        if (existing && existing.fonteSincronizacao !== FONTE_PROJETADA) continue;
        const cutoffAt = calculateBrazilCutoff(drawDate, horarioCorteLocal);
        if (existing) await this.prisma.concurso.update({ where: { id: existing.id }, data: { dataSorteio: drawDate, cutoffAt, fonteSincronizacao: source, sincronizadoEm: new Date() } });
        else await this.prisma.concurso.create({ data: { modalidade, numeroConcurso: numero, dataSorteio: drawDate, cutoffAt, valorEstimadoPremio: null, acumulado: false, status: cutoffAt.getTime() > Date.now() ? 'aberto' : 'fechado', fonteSincronizacao: source } });
        added += 1;
      } catch { break; }
    }
    return added;
  }

  /**
   * Procura, na CAIXA, o concurso numerado de cada festa da modalidade (ex.: Mega da Virada) que cai nos próximos meses,
   * mesmo estando muito depois do "próximo concurso". Como as datas crescem com o número, a busca é binária (poucas consultas).
   * Se achar, o concurso entra como oficial, com o nome da festa; se já havia um provisório do mesmo dia, ele é adotado.
   * Qualquer falha é ignorada: o cadastro manual da data comemorativa continua valendo.
   */
  private async syncFestivals(modalidade: ModalidadeLoteria, horarioCorteLocal: string, nextNumber: number, nextDate: Date): Promise<number> {
    const windowDays = Math.min(Math.max(Math.trunc(Number(this.config.get<string>('CAIXA_JANELA_FESTAS_DIAS') ?? 200)) || 0, 0), 400);
    if (windowDays <= 0) return 0;
    const sources = this.caixaSources();
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    const now = Date.now();
    let found = 0;
    for (const preset of FESTAS_PRESETS.filter((item) => item.modalidade === modalidade)) {
      const draw = proximoSorteioFesta(preset.chave);
      // Só datas confirmadas pela CAIXA: uma data apenas prevista poderia rotular como festa um sorteio comum.
      if (!draw || !draw.confirmado) continue;
      const targetInstant = new Date(`${draw.data}T${draw.hora}:00-03:00`);
      if (targetInstant.getTime() - now > windowDays * 86_400_000) continue;
      const already = (await this.prisma.concurso.findMany({ where: { modalidade, numeroDefinido: true, especial: preset.chave } })).some((item) => brazilDayKey(item.dataSorteio) === draw.data);
      if (already) continue;
      try {
        const contestNumber = await this.findContestOnDay(modalidade, nextNumber, nextDate, draw.data, sources, timeoutMs);
        if (contestNumber === null) continue;
        await this.adoptFestival(modalidade, horarioCorteLocal, contestNumber, targetInstant, preset);
        found += 1;
      } catch { /* melhor esforço */ }
    }
    return found;
  }

  /** Busca binária do número do concurso que será sorteado no dia `targetDay` (AAAA-MM-DD). Devolve null se a CAIXA ainda não o publicou. */
  private async findContestOnDay(modalidade: ModalidadeLoteria, nextNumber: number, nextDate: Date, targetDay: string, sources: ReturnType<LotteriesService['caixaSources']>, timeoutMs: number): Promise<number | null> {
    const nextDay = brazilDayKey(nextDate);
    if (nextDay === targetDay) return nextNumber;
    if (nextDay > targetDay) return null;
    const spanDays = Math.ceil((new Date(`${targetDay}T12:00:00-03:00`).getTime() - new Date(`${nextDay}T12:00:00-03:00`).getTime()) / 86_400_000);
    let low = nextNumber + 1;
    let high = nextNumber + Math.min(spanDays + 3, 450);
    for (let step = 0; step < 14 && low <= high; step += 1) {
      const middle = Math.floor((low + high) / 2);
      const day = await this.probeContestDay(modalidade, middle, sources, timeoutMs);
      if (day === null) high = middle - 1;
      else if (day === targetDay) return middle;
      else if (day < targetDay) low = middle + 1;
      else high = middle - 1;
    }
    return null;
  }

  /** Dia (AAAA-MM-DD) do sorteio do concurso `numero` na CAIXA, ou null se ele não existe (ainda). */
  private async probeContestDay(modalidade: ModalidadeLoteria, numero: number, sources: ReturnType<LotteriesService['caixaSources']>, timeoutMs: number): Promise<string | null> {
    try {
      const { payload } = await fetchCaixaContest(modalidade, sources, { timeoutMs, retries: 0, contestNumber: numero, userAgent: this.config.get<string>('CAIXA_USER_AGENT'), health: this.health });
      const data = normalizeCaixaContestPayload(payload);
      const drawDate = parseCaixaDate(data.dataApuracao);
      if (data.numero !== numero || !drawDate) return null;
      return brazilDayKey(drawDate);
    } catch { return null; }
  }

  /** Grava o concurso numerado da festa: marca o que já existe, adota o provisório do mesmo dia ou cria. Mantém a hora oficial da festa. */
  private async adoptFestival(modalidade: ModalidadeLoteria, horarioCorteLocal: string, numero: number, drawDate: Date, preset: { chave: string; nome: string }): Promise<void> {
    const cutoffAt = festivalCutoff(drawDate, horarioCorteLocal);
    await this.prisma.$transaction(async (tx) => {
      await adoptProvisionalContests(tx as unknown as FestaTx, modalidade, numero, drawDate);
      const existing = await tx.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: numero } } });
      if (existing) {
        if (existing.status === 'apurado') return;
        await tx.concurso.update({ where: { id: existing.id }, data: { especial: existing.especial ?? preset.chave, nomeEspecial: existing.nomeEspecial ?? preset.nome, numeroDefinido: true, dataSorteio: drawDate, cutoffAt, status: cutoffAt.getTime() > Date.now() ? 'aberto' : existing.status, sincronizadoEm: new Date() } });
      } else {
        await tx.concurso.create({ data: { modalidade, numeroConcurso: numero, dataSorteio: drawDate, cutoffAt, valorEstimadoPremio: null, acumulado: false, status: cutoffAt.getTime() > Date.now() ? 'aberto' : 'fechado', fonteSincronizacao: 'caixa', especial: preset.chave, nomeEspecial: preset.nome, numeroDefinido: true } });
      }
    });
  }

  /** Testa a conexão com cada modalidade sem gravar nada. Usado pelo painel do admin. */
  async diagnostics(): Promise<{ fontes: Array<{ tipo: string; url: string }>; timeoutMs: number; resultados: Array<{ modalidade: string; ok: boolean; fonte: string | null; latenciaMs: number; numero: number | null; proximo: number | null; erro: string | null; dica: string | null; tentativas: CaixaAttempt[] }> }> {
    const sources = this.caixaSources();
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    const resultados = await Promise.all([...MODALIDADES_LOTERIA].map(async (modalidade) => {
      const started = Date.now();
      try {
        const result = await fetchCaixaContest(modalidade, sources, { timeoutMs, retries: 0, userAgent: this.config.get<string>('CAIXA_USER_AGENT') });
        return { modalidade, ok: true, fonte: result.source, latenciaMs: Date.now() - started, numero: result.payload.numero ?? null, proximo: result.payload.numeroConcursoProximo ?? null, erro: null, dica: null, tentativas: result.attempts };
      } catch (error) {
        const attempts = error instanceof CaixaFetchError ? error.attempts : [];
        const last = [...attempts].reverse().find((attempt) => !attempt.skipped);
        return { modalidade, ok: false, fonte: null, latenciaMs: Date.now() - started, numero: null, proximo: null, erro: last?.error ?? (error instanceof Error ? error.message : 'falha desconhecida'), dica: last?.hint ?? null, tentativas: attempts };
      }
    }));
    return { fontes: sources.map((source) => ({ tipo: source.kind, url: source.template })), timeoutMs, resultados };
  }

  private async persistContestPayload(modalidade: ModalidadeLoteria, horarioCorteLocal: string, rawPayload: unknown, source: string = 'caixa'): Promise<boolean> {
    const payload = normalizeCaixaContestPayload(rawPayload);
    const currentDrawDate = parseCaixaDate(payload.dataApuracao);
    const nextDrawDate = parseCaixaDate(payload.dataProximoConcurso);
    if (!payload.numero || !payload.numeroConcursoProximo || !currentDrawDate || !nextDrawDate) {
      throw new ServiceUnavailableException(`Resposta incompleta da CAIXA para ${modalidade}: concurso ou datas inválidos.`);
    }

    const currentCutoffAt = calculateBrazilCutoff(currentDrawDate, horarioCorteLocal);
    const nextCutoffAt = calculateBrazilCutoff(nextDrawDate, horarioCorteLocal);
    const numbers = this.parseDrawnNumbers(payload);
    const prizeTiers = payload.listaRateioPremio ?? [];
    const nextEstimatedPrize = payload.valorEstimadoProximoConcurso ?? payload.valorAcumuladoProximoConcurso ?? null;

    await this.prisma.$transaction(async (tx) => {
      // Concurso de festa criado antes do número oficial (ex.: Mega da Virada) vira o concurso oficial da mesma data.
      await adoptProvisionalContests(tx as unknown as FestaTx, modalidade, payload.numero!, currentDrawDate);
      await adoptProvisionalContests(tx as unknown as FestaTx, modalidade, payload.numeroConcursoProximo!, nextDrawDate);
      const currentContest = await tx.concurso.upsert({
        where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: payload.numero! } },
        create: {
          modalidade,
          numeroConcurso: payload.numero!,
          dataSorteio: currentDrawDate,
          cutoffAt: currentCutoffAt,
          valorEstimadoPremio: null,
          acumulado: Boolean(payload.acumulado),
          status: numbers.length > 0 ? 'apurado' : 'fechado',
          fonteSincronizacao: source,
        },
        update: {
          dataSorteio: currentDrawDate,
          cutoffAt: currentCutoffAt,
          acumulado: Boolean(payload.acumulado),
          ...(numbers.length > 0 ? { status: 'apurado' } : {}),
          fonteSincronizacao: source,
          sincronizadoEm: new Date(),
        },
      });

      if (numbers.length > 0) {
        const secondDraw = modalidade === 'duplasena' ? (payload.listaDezenasSegundoSorteio ?? []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0) : [];
        await tx.resultado.upsert({
          where: { concursoId: currentContest.id },
          create: { concursoId: currentContest.id, numerosSorteados: numbers, numerosSegundoSorteio: secondDraw, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue },
          update: { numerosSorteados: numbers, numerosSegundoSorteio: secondDraw, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue, apuradoEm: new Date() },
        });
      }

      // Concurso de festa com hora definida (ex.: 10:00): a CAIXA só informa o dia, então mantemos a hora e o corte já gravados.
      const existingNext = await tx.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: payload.numeroConcursoProximo! } } });
      const keepSpecialTime = Boolean(existingNext?.especial) && brazilDayKey(existingNext!.dataSorteio) === brazilDayKey(nextDrawDate);
      await tx.concurso.upsert({
        where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: payload.numeroConcursoProximo! } },
        create: {
          modalidade,
          numeroConcurso: payload.numeroConcursoProximo!,
          dataSorteio: nextDrawDate,
          cutoffAt: nextCutoffAt,
          valorEstimadoPremio: nextEstimatedPrize,
          acumulado: Boolean(payload.acumulado),
          status: nextCutoffAt.getTime() > Date.now() ? 'aberto' : 'fechado',
          fonteSincronizacao: source,
        },
        update: {
          ...(keepSpecialTime ? {} : { dataSorteio: nextDrawDate, cutoffAt: nextCutoffAt }),
          valorEstimadoPremio: nextEstimatedPrize,
          acumulado: Boolean(payload.acumulado),
          fonteSincronizacao: source,
          sincronizadoEm: new Date(),
        },
      });
    });

    return true;
  }

  private parseDrawnNumbers(payload: CaixaContestPayload): number[] {
    const rawNumbers = payload.dezenasSorteadasOrdemSorteio ?? payload.listaDezenas ?? [];
    const numbers = rawNumbers.map((value) => Number(value));
    if (numbers.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new ServiceUnavailableException('Resposta da CAIXA contém dezenas inválidas.');
    }
    return numbers;
  }

  private caixaSources() {
    return buildCaixaSources({
      CAIXA_API_BASE_URL: this.config.get<string>('CAIXA_API_BASE_URL'),
      CAIXA_FALLBACK_BASE_URL: this.config.get<string>('CAIXA_FALLBACK_BASE_URL'),
    });
  }

  private async fetchFromCaixa(modalidade: ModalidadeLoteria): Promise<{ payload: CaixaContestPayload; source: string }> {
    const sources = this.caixaSources();
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    try {
      const result = await fetchCaixaContest(modalidade, sources, { timeoutMs, retries: 1, userAgent: this.config.get<string>('CAIXA_USER_AGENT'), health: this.health });
      return { payload: result.payload, source: result.source };
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error ? error.message : `Não foi possível sincronizar ${modalidade}.`);
    }
  }

  /**
   * Situação de cada modalidade: o concurso mais recente que o sistema conhece (sem contar festas) e se ainda está aberto.
   * Serve para explicar no painel por que uma modalidade está sem concurso aberto (ex.: dia de sorteio, depois do corte).
   */
  async situationByModality() {
    await ensureUpcomingContestsSoon(this.prisma, calculateBrazilCutoff);
    const now = Date.now();
    return Promise.all([...MODALIDADES_LOTERIA].map(async (modalidade) => {
      const latest = await this.prisma.concurso.findFirst({ where: { modalidade, especial: null }, orderBy: { numeroConcurso: 'desc' }, select: { numeroConcurso: true, status: true, dataSorteio: true, cutoffAt: true, sincronizadoEm: true, fonteSincronizacao: true } });
      const open = Boolean(latest && latest.status === 'aberto' && latest.cutoffAt.getTime() > now);
      return { modalidade, ultimo: latest ? { numero: latest.numeroConcurso, status: latest.status, previsto: latest.fonteSincronizacao === FONTE_PROJETADA, dataSorteio: latest.dataSorteio, cutoffAt: latest.cutoffAt, sincronizadoEm: latest.sincronizadoEm } : null, aberto: open };
    }));
  }

  /** Remove um concurso de festa que ainda não tem bolão (ex.: data criada por engano). */
  async deleteFestival(id: string, actorId?: string) {
    const contest = await this.prisma.concurso.findUnique({ where: { id }, include: { _count: { select: { boloes: true } } } });
    if (!contest || !contest.especial) throw new NotFoundException('Concurso de festa não encontrado.');
    if (contest._count.boloes > 0) throw new ConflictException('Este concurso de festa já tem bolão. Cancele o bolão antes de remover a data.');
    await this.prisma.concurso.delete({ where: { id } });
    await this.audit?.record(this.prisma, { entidade: 'concurso', entidadeId: id, evento: 'concurso.festa_removida', atorId: actorId, payloadAntes: { modalidade: contest.modalidade, nomeEspecial: contest.nomeEspecial, dataSorteio: contest.dataSorteio } });
    return { removido: true };
  }

  /** Cadastro manual de concurso (contingência quando a API da CAIXA está indisponível). */
  async createManual(dto: CreateManualContestDto) {
    const modalidade = this.assertModalidade(dto.modalidade);
    const config = await this.prisma.configLoteria.findUnique({ where: { modalidade } });
    if (!config) throw new BadRequestException('Modalidade sem configuração cadastrada.');
    const drawDate = new Date(`${dto.dataSorteio}T20:00:00-03:00`);
    if (Number.isNaN(drawDate.getTime())) throw new BadRequestException('Data do sorteio inválida.');
    if (drawDate.getTime() < Date.now()) throw new BadRequestException('A data do sorteio deve ser futura.');
    const exists = await this.prisma.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: dto.numeroConcurso } } });
    if (exists) throw new ConflictException('Este concurso já está cadastrado.');
    const contest = await this.prisma.concurso.create({
      data: { modalidade, numeroConcurso: dto.numeroConcurso, dataSorteio: drawDate, cutoffAt: calculateBrazilCutoff(drawDate, config.horarioCorteLocal), acumulado: Boolean(dto.acumulado), status: 'aberto', fonteSincronizacao: 'manual' },
    });
    return this.toPublicContest(contest);
  }

  festivalPresets() {
    return FESTAS_PRESETS.map((preset) => ({ ...preset, proximoSorteio: proximoSorteioFesta(preset.chave) }));
  }

  /**
   * Concurso de festa: nasce aberto e já aceita bolões. Sem número oficial, usa um número provisório (negativo)
   * e é trocado pelo oficial na próxima sincronização com a CAIXA (mesma modalidade e mesmo dia).
   */
  async createFestival(dto: CreateFestaContestDto, actorId: string) {
    const preset = FESTAS_PRESETS.find((item) => item.chave === dto.especial);
    if (!preset && dto.especial !== 'personalizado') throw new BadRequestException('Escolha uma festa da lista ou "personalizado".');
    const modalidade = this.assertModalidade(preset?.modalidade ?? dto.modalidade ?? '');
    const nome = (preset?.nome ?? dto.nomeEspecial ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome da festa (ex.: Mega da Virada).');
    const config = await this.prisma.configLoteria.findUnique({ where: { modalidade } });
    if (!config) throw new BadRequestException('Modalidade sem configuração cadastrada.');
    const hora = dto.horaSorteio ?? '20:00';
    const drawDate = new Date(`${dto.dataSorteio}T${hora}:00-03:00`);
    if (Number.isNaN(drawDate.getTime())) throw new BadRequestException('Data do sorteio inválida.');
    if (brazilDayKey(drawDate) !== dto.dataSorteio) throw new BadRequestException('Data do sorteio inválida.');
    if (drawDate.getTime() <= Date.now()) throw new BadRequestException('A data do sorteio deve ser futura.');
    const defined = dto.numeroConcurso !== undefined;
    const numero = defined ? dto.numeroConcurso! : provisionalContestNumber(drawDate);
    const exists = await this.prisma.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: numero } } });
    if (exists) {
      // Se a CAIXA já trouxe o concurso oficial dessa data, só marcamos a festa nele (sem duplicar).
      if (defined && !exists.especial) {
        const marked = await this.prisma.concurso.update({ where: { id: exists.id }, data: { especial: preset?.chave ?? 'personalizado', nomeEspecial: nome } });
        await this.audit?.record(this.prisma, { entidade: 'concurso', entidadeId: marked.id, evento: 'concurso.festa_marcada', atorId: actorId, payloadDepois: { especial: marked.especial, nomeEspecial: marked.nomeEspecial } });
        return this.toPublicContest(marked);
      }
      throw new ConflictException('Este concurso de festa já está cadastrado.');
    }
    if (!defined) {
      const sameDay = (await this.prisma.concurso.findMany({ where: { modalidade, especial: { not: null }, numeroDefinido: true } })).find((item) => brazilDayKey(item.dataSorteio) === dto.dataSorteio);
      if (sameDay) throw new ConflictException(`Já existe o concurso ${sameDay.numeroConcurso} nessa data com a festa marcada. Crie o bolão nele.`);
    }
    const contest = await this.prisma.concurso.create({
      data: {
        modalidade, numeroConcurso: numero, dataSorteio: drawDate, cutoffAt: festivalCutoff(drawDate, config.horarioCorteLocal),
        valorEstimadoPremio: dto.valorEstimadoPremio ?? null, acumulado: false, status: 'aberto', fonteSincronizacao: 'manual',
        especial: preset?.chave ?? 'personalizado', nomeEspecial: nome, numeroDefinido: defined,
      },
    });
    await this.audit?.record(this.prisma, { entidade: 'concurso', entidadeId: contest.id, evento: 'concurso.festa_criada', atorId: actorId, payloadDepois: { modalidade, nomeEspecial: nome, dataSorteio: dto.dataSorteio, horaSorteio: hora, numeroDefinido: defined } });
    return this.toPublicContest(contest);
  }

  /** Informa o número oficial e/ou o prêmio estimado de um concurso de festa. */
  async updateFestival(id: string, dto: UpdateFestaContestDto, actorId: string) {
    const contest = await this.prisma.concurso.findUnique({ where: { id } });
    if (!contest || !contest.especial) throw new NotFoundException('Concurso de festa não encontrado.');
    if (dto.numeroConcurso === undefined && dto.valorEstimadoPremio === undefined) throw new BadRequestException('Informe o número do concurso ou o prêmio estimado.');
    const data: Record<string, unknown> = {};
    if (dto.numeroConcurso !== undefined) {
      if (contest.numeroDefinido) throw new ConflictException('Este concurso já tem número oficial.');
      const clash = await this.prisma.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade: contest.modalidade, numeroConcurso: dto.numeroConcurso } } });
      if (clash && clash.id !== contest.id) {
        // O concurso oficial já existe (veio da CAIXA): unifica, passando os bolões para ele.
        await this.prisma.$transaction(async (tx) => {
          await adoptProvisionalContests(tx as unknown as FestaTx, contest.modalidade, dto.numeroConcurso!, contest.dataSorteio);
        });
        await this.audit?.record(this.prisma, { entidade: 'concurso', entidadeId: clash.id, evento: 'concurso.festa_unificada', atorId: actorId, payloadDepois: { numeroConcurso: dto.numeroConcurso } });
        return this.toPublicContest(await this.prisma.concurso.findUniqueOrThrow({ where: { id: clash.id } }));
      }
      data.numeroConcurso = dto.numeroConcurso;
      data.numeroDefinido = true;
    }
    if (dto.valorEstimadoPremio !== undefined) data.valorEstimadoPremio = dto.valorEstimadoPremio;
    const updated = await this.prisma.concurso.update({ where: { id }, data });
    await this.audit?.record(this.prisma, { entidade: 'concurso', entidadeId: id, evento: 'concurso.festa_atualizada', atorId: actorId, payloadAntes: { numeroConcurso: contest.numeroConcurso, valorEstimadoPremio: contest.valorEstimadoPremio }, payloadDepois: data as never });
    return this.toPublicContest(updated);
  }

  private assertModalidade(value: string): ModalidadeLoteria {
    if (!MODALIDADES_LOTERIA.includes(value as ModalidadeLoteria)) throw new ServiceUnavailableException('Modalidade de loteria não suportada.');
    return value as ModalidadeLoteria;
  }

  private toPublicContest(contest: { id: string; modalidade: string; numeroConcurso: number; dataSorteio: Date; cutoffAt: Date; valorEstimadoPremio: unknown; acumulado: boolean; especial?: string | null; nomeEspecial?: string | null; numeroDefinido?: boolean; fonteSincronizacao?: string | null }) {
    return {
      id: contest.id,
      modalidade: contest.modalidade,
      numeroConcurso: contest.numeroConcurso,
      dataSorteio: contest.dataSorteio,
      cutoffAt: contest.cutoffAt,
      valorEstimadoPremio: contest.valorEstimadoPremio,
      acumulado: contest.acumulado,
      especial: contest.especial ?? null,
      nomeEspecial: contest.nomeEspecial ?? null,
      numeroDefinido: contest.numeroDefinido ?? true,
      previsto: contest.fonteSincronizacao === FONTE_PROJETADA,
    };
  }
}
