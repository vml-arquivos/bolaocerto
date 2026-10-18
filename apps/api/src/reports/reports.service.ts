import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { endOfBrazilDay, round2 } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { buildCsv, buildXlsx, Column, formatCpf, maskCpf, Row, Sheet } from './export.util';
import { ReportQueryDto } from './reports.dto';

export interface ReportFile { filename: string; contentType: string; buffer: Buffer }
const PAID_STATUSES: StatusCota[] = [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada];

const SALES_COLUMNS: Column[] = [
  { key: 'criadoEm', header: 'Data da venda', type: 'date' },
  { key: 'modalidade', header: 'Modalidade' },
  { key: 'concurso', header: 'Concurso', type: 'int', width: 11 },
  { key: 'sorteio', header: 'Sorteio', type: 'date' },
  { key: 'grupo', header: 'Grupo' },
  { key: 'bolao', header: 'Bolão (ID)', width: 12 },
  { key: 'participante', header: 'Participante', width: 30 },
  { key: 'cpf', header: 'CPF', width: 16 },
  { key: 'email', header: 'E-mail', width: 30 },
  { key: 'telefone', header: 'Telefone', width: 16 },
  { key: 'quantidade', header: 'Qtd. cotas', type: 'int', width: 10 },
  { key: 'valorCota', header: 'Valor da cota', type: 'money' },
  { key: 'valorTotal', header: 'Valor total', type: 'money' },
  { key: 'statusCota', header: 'Status da cota' },
  { key: 'statusPagamento', header: 'Pagamento' },
  { key: 'metodo', header: 'Forma' },
  { key: 'origem', header: 'Origem' },
  { key: 'pagoEm', header: 'Pago em', type: 'date' },
  { key: 'vencimento', header: 'Vencimento', type: 'date' },
  { key: 'custoBilhete', header: 'Custo dos jogos', type: 'money' },
  { key: 'taxaAdmin', header: 'Taxa de administração', type: 'money' },
  { key: 'afiliado', header: 'Afiliado (código)', width: 16 },
  { key: 'comissao', header: 'Comissão', type: 'money' },
  { key: 'statusComissao', header: 'Status da comissão' },
  { key: 'observacao', header: 'Observação', width: 30 },
];

type ShareFull = Prisma.CotaGetPayload<{ include: { bolao: { include: { concurso: true; grupo: true } }; comprador: true; pagamento: true; afiliadoReferencia: true; comissao: true } }>;
const SHARE_INCLUDE = { bolao: { include: { concurso: true, grupo: true } }, comprador: true, pagamento: true, afiliadoReferencia: true, comissao: true } as const;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private range(query: ReportQueryDto): { gte?: Date; lte?: Date } | undefined {
    const range: { gte?: Date; lte?: Date } = {};
    if (query.de) range.gte = new Date(`${query.de}T00:00:00.000-03:00`);
    if (query.ate) range.lte = endOfBrazilDay(query.ate);
    if (range.gte && range.lte && range.gte > range.lte) throw new BadRequestException('A data inicial deve ser anterior à final.');
    return range.gte || range.lte ? range : undefined;
  }

  private salesWhere(query: ReportQueryDto): Prisma.CotaWhereInput {
    const range = this.range(query);
    const and: Prisma.CotaWhereInput[] = [];
    if (query.statusPagamento === 'sem_pagamento') and.push({ pagamento: null });
    else if (query.statusPagamento) and.push({ pagamento: { status: query.statusPagamento as StatusPagamento } });
    return {
      ...(range ? { criadoEm: range } : {}),
      ...(query.status ? { status: query.status as StatusCota } : {}),
      ...(query.bolaoId ? { bolaoId: query.bolaoId } : {}),
      ...(query.afiliadoId ? { afiliadoReferenciaId: query.afiliadoId } : {}),
      ...(query.origem ? { origemVenda: query.origem } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  private shareRow(share: ShareFull, full: boolean): Row {
    const payment = share.pagamento;
    const expired = share.status === StatusCota.reservada && share.expiraReservaEm !== null && share.expiraReservaEm < new Date();
    return {
      criadoEm: share.criadoEm,
      modalidade: share.bolao.concurso.modalidade,
      concurso: share.bolao.concurso.numeroConcurso,
      sorteio: share.bolao.concurso.dataSorteio,
      grupo: share.bolao.grupo.nome,
      bolao: share.bolaoId.slice(0, 8),
      participante: share.titularNome,
      cpf: full ? formatCpf(share.titularCpf) : maskCpf(share.titularCpf),
      email: share.comprador.email,
      telefone: share.comprador.telefone,
      quantidade: share.quantidade,
      valorCota: Number(share.bolao.valorCota),
      valorTotal: payment ? Number(payment.valorBruto) : round2(Number(share.bolao.valorCota) * share.quantidade),
      statusCota: expired ? 'reservada (vencida)' : share.status,
      statusPagamento: payment ? payment.status : 'sem cobrança',
      metodo: payment ? payment.metodo : null,
      origem: share.origemVenda,
      pagoEm: payment?.confirmadoEm ?? null,
      vencimento: payment?.vencimentoEm ?? share.expiraReservaEm,
      custoBilhete: payment && payment.status === StatusPagamento.confirmado ? Number(payment.valorCustoBilhete) : null,
      taxaAdmin: payment && payment.status === StatusPagamento.confirmado ? Number(payment.valorTaxaAdmin) : null,
      afiliado: share.afiliadoReferencia?.codigoAfiliado ?? null,
      comissao: share.comissao ? Number(share.comissao.valor) : null,
      statusComissao: share.comissao?.status ?? null,
      observacao: payment?.observacao ?? null,
    };
  }

  private async deliver(admin: AuthUser, tipo: string, query: ReportQueryDto, base: string, sheets: Sheet[]): Promise<ReportFile | { json: true }> {
    const format = query.formato ?? 'json';
    if (format === 'json') return { json: true };
    const stamp = new Date().toISOString().slice(0, 10);
    const total = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    await this.audit.record(this.prisma, { entidade: 'relatorio', entidadeId: admin.id, evento: 'relatorio.exportado', atorId: admin.id, payloadDepois: { tipo, formato: format, filtros: { ...query }, linhas: total } as unknown as Prisma.InputJsonValue });
    if (format === 'csv') {
      const main = sheets[0] as Sheet;
      return { filename: `${base}-${stamp}.csv`, contentType: 'text/csv; charset=utf-8', buffer: buildCsv(main.columns, main.rows) };
    }
    return { filename: `${base}-${stamp}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await buildXlsx(sheets, base) };
  }

  /** Resumo executivo: receita, taxa, comissões, inadimplência e pendências. */
  async summary(query: ReportQueryDto) {
    const range = this.range(query);
    const paymentWhere: Prisma.PagamentoWhereInput = { status: StatusPagamento.confirmado, ...(range ? { confirmadoEm: range } : {}) };
    const [totals, byMethod, sharesByStatus, commissions, orphans, waiting] = await Promise.all([
      this.prisma.pagamento.aggregate({ where: paymentWhere, _sum: { valorBruto: true, valorTaxaAdmin: true, valorCustoBilhete: true, valorComissaoAfiliado: true }, _count: true }),
      this.prisma.pagamento.groupBy({ by: ['metodo'], where: paymentWhere, _sum: { valorBruto: true }, _count: true }),
      this.prisma.cota.groupBy({ by: ['status'], where: range ? { criadoEm: range } : {}, _sum: { quantidade: true }, _count: true }),
      this.prisma.comissao.groupBy({ by: ['status'], where: range ? { criadoEm: range } : {}, _sum: { valor: true }, _count: true }),
      this.prisma.pagamento.count({ where: { status: StatusPagamento.confirmado, cota: { status: { in: [StatusCota.cancelada, StatusCota.estornada] } } } }),
      this.prisma.cota.findMany({ where: { status: StatusCota.reservada, ...(range ? { criadoEm: range } : {}) }, select: { quantidade: true, expiraReservaEm: true, bolao: { select: { valorCota: true } } } }),
    ]);
    const now = new Date();
    const waitingValue = waiting.filter((share) => !share.expiraReservaEm || share.expiraReservaEm > now).reduce((sum, share) => sum + Number(share.bolao.valorCota) * share.quantidade, 0);
    const overdueValue = waiting.filter((share) => share.expiraReservaEm && share.expiraReservaEm <= now).reduce((sum, share) => sum + Number(share.bolao.valorCota) * share.quantidade, 0);
    const commissionMap = Object.fromEntries(commissions.map((row) => [row.status, Number(row._sum.valor ?? 0)]));
    const gross = Number(totals._sum.valorBruto ?? 0);
    const fees = Number(totals._sum.valorTaxaAdmin ?? 0);
    const commissionTotal = (commissionMap[StatusComissao.pendente] ?? 0) + (commissionMap[StatusComissao.paga] ?? 0);
    return {
      periodo: { de: query.de ?? null, ate: query.ate ?? null },
      receitaBruta: round2(gross),
      custoJogos: round2(Number(totals._sum.valorCustoBilhete ?? 0)),
      taxaAdministracao: round2(fees),
      comissoes: { pendente: round2(commissionMap[StatusComissao.pendente] ?? 0), paga: round2(commissionMap[StatusComissao.paga] ?? 0), cancelada: round2(commissionMap[StatusComissao.cancelada] ?? 0), total: round2(commissionTotal) },
      resultadoLiquidoPlataforma: round2(fees - commissionTotal),
      pagamentosConfirmados: totals._count,
      ticketMedio: totals._count ? round2(gross / totals._count) : 0,
      aReceber: { valorAguardando: round2(waitingValue), valorVencido: round2(overdueValue) },
      pagamentosSemCotaParaEstorno: orphans,
      porMetodo: byMethod.map((row) => ({ metodo: row.metodo, pagamentos: row._count, valor: round2(Number(row._sum.valorBruto ?? 0)) })),
      cotasPorStatus: sharesByStatus.map((row) => ({ status: row.status, registros: row._count, cotas: row._sum.quantidade ?? 0 })),
    };
  }

  /** Visão por bolão: vendidas, pagas, pendentes, receita. */
  async pools(query: ReportQueryDto) {
    const range = this.range(query);
    const pools = await this.prisma.bolao.findMany({ where: { ...(range ? { criadoEm: range } : {}) }, include: { concurso: true, grupo: { select: { nome: true } } }, orderBy: { criadoEm: 'desc' }, take: 300 });
    const grouped = await this.prisma.cota.groupBy({ by: ['bolaoId', 'status'], where: { bolaoId: { in: pools.map((pool) => pool.id) } }, _sum: { quantidade: true, valorPago: true } });
    return pools.map((pool) => {
      const rows = grouped.filter((row) => row.bolaoId === pool.id);
      const qty = (statuses: StatusCota[]) => rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + (row._sum.quantidade ?? 0), 0);
      const paidValue = rows.filter((row) => PAID_STATUSES.includes(row.status)).reduce((sum, row) => sum + Number(row._sum.valorPago ?? 0), 0);
      return { id: pool.id, status: pool.status, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, sorteio: pool.concurso.dataSorteio, grupo: pool.grupo.nome, valorCota: Number(pool.valorCota), totalCotas: pool.totalCotas, cotasIlimitadas: pool.cotasIlimitadas, cotasPagas: qty(PAID_STATUSES), cotasAguardando: qty([StatusCota.reservada]), cotasCanceladas: qty([StatusCota.cancelada, StatusCota.estornada]), receita: round2(paidValue) };
    });
  }

  async sales(query: ReportQueryDto, admin: AuthUser) {
    const full = query.formato === 'csv' || query.formato === 'xlsx';
    const shares = await this.prisma.cota.findMany({ where: this.salesWhere(query), include: SHARE_INCLUDE, orderBy: { criadoEm: 'desc' }, take: full ? 20000 : 500 });
    const rows = shares.map((share) => this.shareRow(share, full));
    const delivered = await this.deliver(admin, 'vendas', query, 'vendas-bolao-livre', [{ name: 'Vendas', columns: SALES_COLUMNS, rows }]);
    return 'json' in delivered ? { colunas: SALES_COLUMNS, linhas: rows, total: rows.length } : delivered;
  }

  /** Inadimplência: cotas aguardando pagamento ou vencidas, mais pagamentos recebidos sem cota. */
  async unpaid(query: ReportQueryDto, admin: AuthUser) {
    const full = query.formato === 'csv' || query.formato === 'xlsx';
    const range = this.range(query);
    const shares = await this.prisma.cota.findMany({
      where: { ...(range ? { criadoEm: range } : {}), ...(query.bolaoId ? { bolaoId: query.bolaoId } : {}), OR: [{ status: StatusCota.reservada }, { status: StatusCota.cancelada, OR: [{ pagamento: null }, { pagamento: { status: { not: StatusPagamento.confirmado } } }] }] },
      include: SHARE_INCLUDE,
      orderBy: { criadoEm: 'desc' },
      take: full ? 20000 : 500,
    });
    const orphans = await this.prisma.cota.findMany({ where: { status: { in: [StatusCota.cancelada, StatusCota.estornada] }, pagamento: { status: StatusPagamento.confirmado } }, include: SHARE_INCLUDE, orderBy: { criadoEm: 'desc' }, take: 500 });
    const rows = shares.map((share) => this.shareRow(share, full));
    const orphanRows = orphans.map((share) => ({ ...this.shareRow(share, full), situacao: 'Pago sem cota — estornar ao participante' }));
    const columns: Column[] = [...SALES_COLUMNS.slice(0, 25)];
    const delivered = await this.deliver(admin, 'inadimplencia', query, 'nao-pagos-bolao-livre', [
      { name: 'Não pagos', columns, rows },
      { name: 'Pagos sem cota (estornar)', columns: [...columns, { key: 'situacao', header: 'Situação', width: 40 }], rows: orphanRows },
    ]);
    return 'json' in delivered ? { colunas: columns, linhas: rows, pagosSemCota: orphanRows, total: rows.length } : delivered;
  }

  /** Ficha completa do bolão: resumo, jogos e participantes. */
  async poolSheet(id: string, query: ReportQueryDto, admin: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { concurso: true, grupo: true, jogos: { orderBy: { ordem: 'asc' } } } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    const full = query.formato === 'csv' || query.formato === 'xlsx';
    const shares = await this.prisma.cota.findMany({ where: { bolaoId: id }, include: SHARE_INCLUDE, orderBy: [{ titularNome: 'asc' }, { criadoEm: 'asc' }] });
    const rows = shares.map((share) => this.shareRow(share, full));
    const paid = shares.filter((share) => PAID_STATUSES.includes(share.status));
    const confirmed = shares.filter((share) => share.pagamento?.status === StatusPagamento.confirmado);
    const sum = (selector: (share: ShareFull) => number) => round2(confirmed.reduce((total, share) => total + selector(share), 0));
    const summary = {
      modalidade: pool.concurso.modalidade,
      concurso: pool.concurso.numeroConcurso,
      sorteio: pool.concurso.dataSorteio,
      grupo: pool.grupo.nome,
      status: pool.status,
      valorCota: Number(pool.valorCota),
      taxaAdministracaoPct: Number(pool.taxaAdministracaoPct),
      totalCotas: pool.totalCotas,
      cotasPagas: paid.reduce((total, share) => total + share.quantidade, 0),
      cotasAguardando: shares.filter((share) => share.status === StatusCota.reservada).reduce((total, share) => total + share.quantidade, 0),
      participantesPagos: new Set(paid.map((share) => share.compradorId)).size,
      receitaBruta: sum((share) => Number(share.pagamento?.valorBruto ?? 0)),
      custoJogos: sum((share) => Number(share.pagamento?.valorCustoBilhete ?? 0)),
      taxaAdministracao: sum((share) => Number(share.pagamento?.valorTaxaAdmin ?? 0)),
      comissoes: round2(shares.filter((share) => share.comissao && share.comissao.status !== StatusComissao.cancelada).reduce((total, share) => total + Number(share.comissao?.valor ?? 0), 0)),
    };
    const games = pool.jogos.map((game) => ({ ordem: game.ordem, dezenas: game.numeros.map((n) => String(n).padStart(2, '0')).join(' '), quantidade: game.quantidadeDezenas, custo: Number(game.custo) }));
    const summaryRows: Row[] = Object.entries(summary).map(([campo, valor]) => ({ campo, valor: valor instanceof Date ? valor : (valor as string | number | null) }));
    const delivered = await this.deliver(admin, 'bolao', query, `bolao-${pool.concurso.modalidade}-${pool.concurso.numeroConcurso}-${id.slice(0, 8)}`, [
      { name: 'Participantes', columns: SALES_COLUMNS, rows },
      { name: 'Resumo', columns: [{ key: 'campo', header: 'Indicador', width: 28 }, { key: 'valor', header: 'Valor', width: 30 }], rows: summaryRows },
      { name: 'Jogos', columns: [{ key: 'ordem', header: 'Jogo', type: 'int', width: 8 }, { key: 'dezenas', header: 'Dezenas', width: 50 }, { key: 'quantidade', header: 'Qtd. dezenas', type: 'int' }, { key: 'custo', header: 'Custo', type: 'money' }], rows: games },
    ]);
    return 'json' in delivered ? { resumo: summary, jogos: games, colunas: SALES_COLUMNS, linhas: rows } : delivered;
  }

  /** Comissões por afiliado, com pendente/paga/cancelada. */
  async commissions(query: ReportQueryDto, admin: AuthUser) {
    const range = this.range(query);
    const items = await this.prisma.comissao.findMany({ where: { ...(range ? { criadoEm: range } : {}), ...(query.afiliadoId ? { afiliadoId: query.afiliadoId } : {}) }, include: { afiliado: { include: { usuario: true } } } });
    const byAffiliate = new Map<string, Row & { vendas: number; base: number; pendente: number; paga: number; cancelada: number }>();
    for (const item of items) {
      const current = byAffiliate.get(item.afiliadoId) ?? { afiliado: item.afiliado.usuario.nome, codigo: item.afiliado.codigoAfiliado, chavePix: item.afiliado.chavePixRepasse, percentual: Number(item.afiliado.comissaoPadraoPct), vendas: 0, base: 0, pendente: 0, paga: 0, cancelada: 0, total: 0 };
      current.vendas += item.status === StatusComissao.cancelada ? 0 : 1;
      current.base = round2(current.base + (item.status === StatusComissao.cancelada ? 0 : Number(item.baseCalculo ?? 0)));
      current[item.status] = round2(current[item.status] + Number(item.valor));
      current.total = round2(current.pendente + current.paga);
      byAffiliate.set(item.afiliadoId, current);
    }
    const rows = [...byAffiliate.values()].sort((a, b) => Number(b.total) - Number(a.total));
    const columns: Column[] = [
      { key: 'afiliado', header: 'Afiliado', width: 30 }, { key: 'codigo', header: 'Código', width: 14 }, { key: 'chavePix', header: 'Chave Pix de repasse', width: 30 },
      { key: 'percentual', header: '% padrão', width: 10 }, { key: 'vendas', header: 'Vendas', type: 'int', width: 10 }, { key: 'base', header: 'Base (taxa adm.)', type: 'money' },
      { key: 'pendente', header: 'A pagar', type: 'money' }, { key: 'paga', header: 'Paga', type: 'money' }, { key: 'cancelada', header: 'Cancelada', type: 'money' }, { key: 'total', header: 'Total devido+pago', type: 'money' },
    ];
    const delivered = await this.deliver(admin, 'comissoes', query, 'comissoes-bolao-livre', [{ name: 'Comissões', columns, rows }]);
    return 'json' in delivered ? { colunas: columns, linhas: rows, total: rows.length } : delivered;
  }
}
