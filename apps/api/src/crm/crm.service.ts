import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { round2 } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { buildCsv, buildXlsx, Column, formatCpf, maskCpf, Row } from '../reports/export.util';
import { brl, buildPdfReport } from '../reports/pdf.util';
import { ReportFile } from '../reports/reports.service';
import { CrmListQueryDto, CrmNoteDto, CrmProfileDto } from './crm.dto';
import { BettorMetrics, classify, crmConfigFromEnv, EMPTY_METRICS, LEVEL_LABELS, Nivel, Segmento, SEGMENT_LABELS } from './crm.segments';

const PAID: StatusCota[] = [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada];

export interface BettorRow {
  id: string; nome: string; cpf: string; email: string; telefone: string | null; cidade: string | null; uf: string | null; papel: string; cadastradoEm: Date;
  afiliadoOrigem: string | null; etiquetas: string[]; proximoContatoEm: Date | null;
  nivel: Nivel; nivelNome: string; segmentos: Segmento[]; segmentoNomes: string[];
  totalGasto: number; cotasPagas: number; compras: number; boloesDistintos: number; ticketMedio: number; primeiraCompraEm: Date | null; ultimaCompraEm: Date | null; diasSemComprar: number | null;
  cotasPendentes: number; valorPendente: number; reservasVencidas: number; premiosGanhos: number;
}

const EXPORT_COLUMNS: Column[] = [
  { key: 'nome', header: 'Apostador', width: 30 }, { key: 'cpf', header: 'CPF', width: 16 }, { key: 'email', header: 'E-mail', width: 30 }, { key: 'telefone', header: 'Telefone', width: 16 },
  { key: 'cidade', header: 'Cidade/UF', width: 18 }, { key: 'nivelNome', header: 'Nível', width: 10 }, { key: 'segmentos', header: 'Segmentos', width: 34 },
  { key: 'totalGasto', header: 'Total investido', type: 'money', sum: true }, { key: 'cotasPagas', header: 'Cotas pagas', type: 'int', width: 11, sum: true }, { key: 'compras', header: 'Compras', type: 'int', width: 10, sum: true },
  { key: 'boloesDistintos', header: 'Bolões', type: 'int', width: 9 }, { key: 'ticketMedio', header: 'Ticket médio', type: 'money' },
  { key: 'primeiraCompraEm', header: 'Primeira compra', type: 'date' }, { key: 'ultimaCompraEm', header: 'Última compra', type: 'date' }, { key: 'diasSemComprar', header: 'Dias sem comprar', type: 'int', width: 12 },
  { key: 'valorPendente', header: 'Valor pendente', type: 'money', sum: true }, { key: 'premiosGanhos', header: 'Prêmios', type: 'money' },
  { key: 'afiliadoOrigem', header: 'Afiliado de origem', width: 16 }, { key: 'etiquetas', header: 'Etiquetas', width: 20 }, { key: 'proximoContatoEm', header: 'Próximo contato', type: 'date' },
];

@Injectable()
export class CrmService {
  private readonly cfg = crmConfigFromEnv();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Métricas por apostador, calculadas a partir de cotas pagas e reservas. */
  private async metrics(now: Date): Promise<{ byUser: Map<string, BettorMetrics>; prizes: Map<string, number> }> {
    const [paid, pending] = await Promise.all([
      this.prisma.cota.findMany({ where: { status: { in: PAID } }, select: { compradorId: true, bolaoId: true, quantidade: true, valorPago: true, criadoEm: true, status: true, valorPremio: true, pagamento: { select: { valorBruto: true, confirmadoEm: true } } } }),
      this.prisma.cota.findMany({ where: { status: StatusCota.reservada }, select: { compradorId: true, quantidade: true, expiraReservaEm: true, bolao: { select: { valorCota: true } } } }),
    ]);
    const byUser = new Map<string, BettorMetrics>();
    const pools = new Map<string, Set<string>>();
    const prizes = new Map<string, number>();
    const get = (id: string) => { let item = byUser.get(id); if (!item) { item = { ...EMPTY_METRICS }; byUser.set(id, item); } return item; };
    for (const share of paid) {
      const item = get(share.compradorId);
      const value = Number(share.pagamento?.valorBruto ?? share.valorPago ?? 0);
      const when = share.pagamento?.confirmadoEm ?? share.criadoEm;
      item.totalGasto = round2(item.totalGasto + value);
      item.cotasPagas += share.quantidade;
      item.compras += 1;
      if (!item.primeiraCompraEm || when < item.primeiraCompraEm) item.primeiraCompraEm = when;
      if (!item.ultimaCompraEm || when > item.ultimaCompraEm) item.ultimaCompraEm = when;
      pools.set(share.compradorId, (pools.get(share.compradorId) ?? new Set()).add(share.bolaoId));
      if (share.valorPremio) prizes.set(share.compradorId, round2((prizes.get(share.compradorId) ?? 0) + Number(share.valorPremio)));
    }
    for (const [id, set] of pools) get(id).boloesDistintos = set.size;
    for (const share of pending) {
      const item = get(share.compradorId);
      item.cotasPendentes += share.quantidade;
      item.valorPendente = round2(item.valorPendente + Number(share.bolao.valorCota) * share.quantidade);
      if (share.expiraReservaEm && share.expiraReservaEm < now) item.reservasVencidas += 1;
    }
    return { byUser, prizes };
  }

  private async rows(full: boolean): Promise<BettorRow[]> {
    const now = new Date();
    const [{ byUser, prizes }, users] = await Promise.all([
      this.metrics(now),
      this.prisma.usuario.findMany({
        where: { papel: { in: ['cotista', 'afiliado'] } },
        select: { id: true, nome: true, cpf: true, email: true, telefone: true, enderecoCidade: true, enderecoUf: true, papel: true, criadoEm: true, indicadoPorAfiliado: { select: { codigoAfiliado: true } }, crmPerfil: { select: { etiquetas: true, proximoContatoEm: true } } },
      }),
    ]);
    return users.map((user) => {
      const metric = byUser.get(user.id) ?? EMPTY_METRICS;
      const tags = user.crmPerfil?.etiquetas ?? [];
      const { nivel, segmentos } = classify(metric, tags, now, this.cfg);
      return {
        id: user.id, nome: user.nome, cpf: full ? formatCpf(user.cpf) : maskCpf(user.cpf), email: user.email, telefone: user.telefone,
        cidade: user.enderecoCidade, uf: user.enderecoUf, papel: user.papel, cadastradoEm: user.criadoEm,
        afiliadoOrigem: user.indicadoPorAfiliado?.codigoAfiliado ?? null, etiquetas: tags, proximoContatoEm: user.crmPerfil?.proximoContatoEm ?? null,
        nivel, nivelNome: LEVEL_LABELS[nivel], segmentos, segmentoNomes: segmentos.map((segment) => SEGMENT_LABELS[segment]),
        totalGasto: metric.totalGasto, cotasPagas: metric.cotasPagas, compras: metric.compras, boloesDistintos: metric.boloesDistintos,
        ticketMedio: metric.compras ? round2(metric.totalGasto / metric.compras) : 0,
        primeiraCompraEm: metric.primeiraCompraEm, ultimaCompraEm: metric.ultimaCompraEm,
        diasSemComprar: metric.ultimaCompraEm ? Math.floor((now.getTime() - metric.ultimaCompraEm.getTime()) / 86_400_000) : null,
        cotasPendentes: metric.cotasPendentes, valorPendente: metric.valorPendente, reservasVencidas: metric.reservasVencidas, premiosGanhos: prizes.get(user.id) ?? 0,
      };
    });
  }

  private filtered(rows: BettorRow[], query: CrmListQueryDto): BettorRow[] {
    const term = query.busca?.trim().toLowerCase();
    const digits = term?.replace(/\D/g, '');
    let result = rows.filter((row) => {
      if (query.segmento && !row.segmentos.includes(query.segmento)) return false;
      if (query.nivel && row.nivel !== query.nivel) return false;
      if (term && !(row.nome.toLowerCase().includes(term) || row.email.toLowerCase().includes(term) || (digits && row.cpf.replace(/\D/g, '').includes(digits)) || row.etiquetas.some((tag) => tag.toLowerCase().includes(term)))) return false;
      return true;
    });
    const order = query.ordenar ?? 'gasto';
    const compare: Record<string, (a: BettorRow, b: BettorRow) => number> = {
      gasto: (a, b) => b.totalGasto - a.totalGasto, cotas: (a, b) => b.cotasPagas - a.cotasPagas, boloes: (a, b) => b.boloesDistintos - a.boloesDistintos,
      ultima: (a, b) => (b.ultimaCompraEm?.getTime() ?? 0) - (a.ultimaCompraEm?.getTime() ?? 0), nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    };
    result = result.sort(compare[order] ?? compare.gasto!);
    return result;
  }

  async overview() {
    const rows = await this.rows(false);
    const buyers = rows.filter((row) => row.compras > 0);
    const count = (segment: Segmento) => rows.filter((row) => row.segmentos.includes(segment)).length;
    const revenue = round2(buyers.reduce((sum, row) => sum + row.totalGasto, 0));
    const vipRevenue = round2(rows.filter((row) => row.segmentos.includes('vip')).reduce((sum, row) => sum + row.totalGasto, 0));
    const tiers = (['diamante', 'ouro', 'prata', 'bronze'] as Nivel[]).map((tier) => ({ nivel: tier, nome: LEVEL_LABELS[tier], apostadores: rows.filter((row) => row.nivel === tier).length, valor: round2(rows.filter((row) => row.nivel === tier).reduce((sum, row) => sum + row.totalGasto, 0)) }));
    const top = [...buyers].sort((a, b) => b.totalGasto - a.totalGasto).slice(0, 10).map((row) => ({ id: row.id, nome: row.nome, nivel: row.nivel, nivelNome: row.nivelNome, totalGasto: row.totalGasto, cotasPagas: row.cotasPagas, boloesDistintos: row.boloesDistintos, ultimaCompraEm: row.ultimaCompraEm }));
    const reactivate = rows.filter((row) => row.segmentos.includes('vip') && row.segmentos.includes('inativo')).sort((a, b) => b.totalGasto - a.totalGasto).slice(0, 10).map((row) => ({ id: row.id, nome: row.nome, nivelNome: row.nivelNome, totalGasto: row.totalGasto, diasSemComprar: row.diasSemComprar }));
    const followUps = rows.filter((row) => row.proximoContatoEm && row.proximoContatoEm.getTime() <= Date.now() + 7 * 86_400_000).sort((a, b) => a.proximoContatoEm!.getTime() - b.proximoContatoEm!.getTime()).slice(0, 10).map((row) => ({ id: row.id, nome: row.nome, proximoContatoEm: row.proximoContatoEm }));
    return {
      totais: { cadastrados: rows.length, compradores: buyers.length, receitaTotal: revenue, ticketMedioPorApostador: buyers.length ? round2(revenue / buyers.length) : 0, receitaVip: vipRevenue, participacaoVipPct: revenue ? round2((vipRevenue / revenue) * 100) : 0 },
      segmentos: (Object.keys(SEGMENT_LABELS) as Segmento[]).map((segment) => ({ chave: segment, nome: SEGMENT_LABELS[segment], apostadores: count(segment) })),
      niveis: tiers,
      maioresApostadores: top, reativar: reactivate, acompanhamentos: followUps,
      criterios: { prata: this.cfg.prata, ouro: this.cfg.ouro, diamante: this.cfg.diamante, inativoDias: this.cfg.inativoDias, novoDias: this.cfg.novoDias, recorrenteMinBoloes: this.cfg.recorrenteMinBoloes },
    };
  }

  async list(query: CrmListQueryDto, admin: AuthUser): Promise<{ items: BettorRow[]; total: number; pagina: number; paginas: number } | ReportFile> {
    const exporting = query.formato && query.formato !== 'json';
    const rows = this.filtered(await this.rows(Boolean(exporting && query.formato !== 'pdf')), query);
    if (!exporting) {
      const pageSize = query.porPagina ?? 25;
      const page = Math.max(query.pagina ?? 1, 1);
      return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, pagina: page, paginas: Math.max(Math.ceil(rows.length / pageSize), 1) };
    }
    const exportRows: Row[] = rows.slice(0, 20000).map(({ segmentoNomes, segmentos: _segmentos, etiquetas, ...row }) => ({ ...row, cidade: row.cidade ? `${row.cidade}${row.uf ? `/${row.uf}` : ''}` : null, segmentos: segmentoNomes.join(', '), etiquetas: etiquetas.join(', ') }));
    await this.audit.record(this.prisma, { entidade: 'relatorio', entidadeId: admin.id, evento: 'relatorio.exportado', atorId: admin.id, payloadDepois: { tipo: 'crm-apostadores', formato: query.formato, filtros: { ...query }, linhas: exportRows.length } as unknown as Prisma.InputJsonValue });
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `apostadores-bolao-livre-${stamp}`;
    if (query.formato === 'csv') return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', buffer: buildCsv(EXPORT_COLUMNS, exportRows) };
    if (query.formato === 'xlsx') return { filename: `${base}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await buildXlsx([{ name: 'Apostadores', columns: EXPORT_COLUMNS, rows: exportRows }], 'Apostadores') };
    const pdfColumns = ['nome', 'cpf', 'nivelNome', 'totalGasto', 'cotasPagas', 'boloesDistintos', 'ticketMedio', 'ultimaCompraEm', 'diasSemComprar', 'valorPendente'].map((key) => EXPORT_COLUMNS.find((column) => column.key === key)!);
    const filters = [query.segmento ? `Segmento: ${SEGMENT_LABELS[query.segmento]}` : null, query.nivel ? `Nível: ${query.nivel}` : null, query.busca ? `Busca: ${query.busca}` : null].filter(Boolean) as string[];
    const buyers = rows.filter((row) => row.compras > 0);
    return {
      filename: `${base}.pdf`, contentType: 'application/pdf',
      buffer: await buildPdfReport({
        title: 'Relatório de apostadores (CRM)', subtitle: 'Quem mais investe, com que frequência compra e quem precisa de atenção.', filters, generatedBy: admin.email,
        kpis: [
          { label: 'Apostadores listados', value: String(rows.length) }, { label: 'Já compraram', value: String(buyers.length) },
          { label: 'Total investido', value: brl(buyers.reduce((sum, row) => sum + row.totalGasto, 0)) },
          { label: 'Apostadores VIP', value: String(rows.filter((row) => row.segmentos.includes('vip')).length) },
          { label: 'Valor pendente', value: brl(rows.reduce((sum, row) => sum + row.valorPendente, 0)) },
        ],
        sections: [{ title: 'Apostadores', columns: pdfColumns, rows: exportRows.slice(0, 3000) }],
      }),
    };
  }

  async detail(id: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true, nome: true, cpf: true, email: true, telefone: true, papel: true, statusKyc: true, criadoEm: true, enderecoCidade: true, enderecoUf: true, exclusaoSolicitadaEm: true,
        indicadoPorAfiliado: { select: { codigoAfiliado: true, usuario: { select: { nome: true } } } },
        crmPerfil: true,
        crmNotas: { orderBy: { criadoEm: 'desc' }, take: 50, select: { id: true, texto: true, criadoEm: true, autor: { select: { nome: true } } } },
      },
    });
    if (!user || !['cotista', 'afiliado'].includes(user.papel)) throw new NotFoundException('Apostador não encontrado.');
    const [shares, row] = await Promise.all([
      this.prisma.cota.findMany({
        where: { compradorId: id }, orderBy: { criadoEm: 'desc' }, take: 200,
        select: { id: true, quantidade: true, status: true, criadoEm: true, valorPago: true, valorPremio: true, expiraReservaEm: true, origemVenda: true, bolao: { select: { id: true, valorCota: true, concurso: { select: { modalidade: true, numeroConcurso: true } } } }, pagamento: { select: { status: true, metodo: true, valorBruto: true, confirmadoEm: true } } },
      }),
      this.rows(false).then((all) => all.find((item) => item.id === id)),
    ]);
    const byModality = new Map<string, { cotas: number; valor: number }>();
    for (const share of shares.filter((item) => PAID.includes(item.status))) {
      const key = share.bolao.concurso.modalidade;
      const entry = byModality.get(key) ?? { cotas: 0, valor: 0 };
      entry.cotas += share.quantidade;
      entry.valor = round2(entry.valor + Number(share.pagamento?.valorBruto ?? share.valorPago ?? 0));
      byModality.set(key, entry);
    }
    return {
      perfil: { id: user.id, nome: user.nome, cpf: maskCpf(user.cpf), email: user.email, telefone: user.telefone, papel: user.papel, statusKyc: user.statusKyc, cadastradoEm: user.criadoEm, cidade: user.enderecoCidade, uf: user.enderecoUf, exclusaoSolicitadaEm: user.exclusaoSolicitadaEm, afiliadoOrigem: user.indicadoPorAfiliado ? { codigo: user.indicadoPorAfiliado.codigoAfiliado, nome: user.indicadoPorAfiliado.usuario.nome } : null },
      metricas: row ?? null,
      etiquetas: user.crmPerfil?.etiquetas ?? [],
      proximoContatoEm: user.crmPerfil?.proximoContatoEm ?? null,
      modalidadesPreferidas: [...byModality.entries()].map(([modalidade, value]) => ({ modalidade, ...value })).sort((a, b) => b.valor - a.valor),
      historico: shares.map((share) => ({ id: share.id, criadoEm: share.criadoEm, modalidade: share.bolao.concurso.modalidade, concurso: share.bolao.concurso.numeroConcurso, bolaoId: share.bolao.id, quantidade: share.quantidade, status: share.status, valor: Number(share.pagamento?.valorBruto ?? share.valorPago ?? Number(share.bolao.valorCota) * share.quantidade), pagamento: share.pagamento ? { status: share.pagamento.status, metodo: share.pagamento.metodo, confirmadoEm: share.pagamento.confirmadoEm } : null, premio: share.valorPremio ? Number(share.valorPremio) : null })),
      notas: user.crmNotas.map((note) => ({ id: note.id, texto: note.texto, criadoEm: note.criadoEm, autor: note.autor.nome })),
    };
  }

  async addNote(id: string, dto: CrmNoteDto, admin: AuthUser) {
    const exists = await this.prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Apostador não encontrado.');
    const note = await this.prisma.crmNota.create({ data: { usuarioId: id, autorId: admin.id, texto: dto.texto.trim() }, select: { id: true, texto: true, criadoEm: true } });
    await this.audit.record(this.prisma, { entidade: 'usuario', entidadeId: id, evento: 'crm.nota_criada', atorId: admin.id, payloadDepois: { notaId: note.id } });
    return { ...note, autor: admin.email };
  }

  async updateProfile(id: string, dto: CrmProfileDto, admin: AuthUser) {
    const exists = await this.prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Apostador não encontrado.');
    const etiquetas = dto.etiquetas ? [...new Set(dto.etiquetas.map((tag) => tag.trim().toLowerCase()).filter(Boolean))] : undefined;
    const data = {
      ...(etiquetas ? { etiquetas } : {}),
      ...(dto.proximoContatoEm !== undefined ? { proximoContatoEm: dto.proximoContatoEm === null ? null : new Date(dto.proximoContatoEm) } : {}),
    };
    const profile = await this.prisma.crmPerfil.upsert({ where: { usuarioId: id }, create: { usuarioId: id, ...data }, update: data });
    await this.audit.record(this.prisma, { entidade: 'usuario', entidadeId: id, evento: 'crm.perfil_atualizado', atorId: admin.id, payloadDepois: { etiquetas: profile.etiquetas, proximoContatoEm: profile.proximoContatoEm } as unknown as Prisma.InputJsonValue });
    return { etiquetas: profile.etiquetas, proximoContatoEm: profile.proximoContatoEm };
  }
}
