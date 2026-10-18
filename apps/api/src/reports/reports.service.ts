import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusComissao, StatusCota, StatusNotaFiscal, StatusPagamento, MetodoPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { endOfBrazilDay, round2 } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { evaluateReleaseGate } from '../pools/release-gate';
import { buildCsv, buildXlsx, Column, formatCpf, formatDateBr, maskCpf, Row, Sheet } from './export.util';
import { brl, buildPdfReport, PdfKpi, PdfSection } from './pdf.util';
import { ReportQueryDto } from './reports.dto';

/** Conteúdo do PDF: títulos, indicadores e tabelas (colunas escolhidas para caber na página). */
export interface PdfSpec { title: string; subtitle?: string; kpis?: PdfKpi[]; sections: PdfSection[] }
const NAMES: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', pix_automatico: 'Pix Automático', manual: 'Manual' };
const pick = (columns: Column[], keys: string[], sums: string[] = []): Column[] => keys.map((key) => { const column = columns.find((item) => item.key === key); if (!column) throw new Error(`coluna ${key} inexistente`); return sums.includes(key) ? { ...column, sum: true } : column; });

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

  private async deliver(admin: AuthUser, tipo: string, query: ReportQueryDto, base: string, sheets: Sheet[], pdf?: PdfSpec): Promise<ReportFile | { json: true }> {
    const format = query.formato ?? 'json';
    if (format === 'json') return { json: true };
    const stamp = new Date().toISOString().slice(0, 10);
    const total = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    await this.audit.record(this.prisma, { entidade: 'relatorio', entidadeId: admin.id, evento: 'relatorio.exportado', atorId: admin.id, payloadDepois: { tipo, formato: format, filtros: { ...query }, linhas: total } as unknown as Prisma.InputJsonValue });
    if (format === 'pdf') {
      const spec: PdfSpec = pdf ?? { title: base, sections: sheets.map((sheet) => ({ title: sheet.name, columns: sheet.columns.slice(0, 10), rows: sheet.rows })) };
      const filters = this.describeFilters(query);
      return { filename: `${base}-${stamp}.pdf`, contentType: 'application/pdf', buffer: await buildPdfReport({ ...spec, filters, generatedBy: admin.email ?? admin.id }) };
    }
    if (format === 'csv') {
      const main = sheets[0] as Sheet;
      return { filename: `${base}-${stamp}.csv`, contentType: 'text/csv; charset=utf-8', buffer: buildCsv(main.columns, main.rows) };
    }
    return { filename: `${base}-${stamp}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await buildXlsx(sheets, base) };
  }

  private limit(query: ReportQueryDto): number {
    return query.formato === 'csv' || query.formato === 'xlsx' ? 20000 : query.formato === 'pdf' ? 3000 : 500;
  }

  private describeFilters(query: ReportQueryDto): string[] {
    const out: string[] = [];
    const brDate = (value: string) => value.split('-').reverse().join('/');
    if (query.de || query.ate) out.push(`Período: ${query.de ? brDate(query.de) : 'início'} a ${query.ate ? brDate(query.ate) : 'hoje'}`);
    if (query.status) out.push(`Cota: ${query.status}`);
    if (query.statusPagamento) out.push(`Pagamento: ${query.statusPagamento.replace('_', ' ')}`);
    if (query.metodo) out.push(`Forma: ${NAMES[query.metodo] ?? query.metodo}`);
    if (query.origem) out.push(`Origem: ${query.origem}`);
    if (query.statusNota) out.push(`Nota: ${query.statusNota}`);
    if (query.bolaoId) out.push(`Bolão: ${query.bolaoId.slice(0, 8)}`);
    if (query.afiliadoId) out.push(`Afiliado: ${query.afiliadoId.slice(0, 8)}`);
    return out;
  }

  /** Resumo executivo: receita, taxa, comissões, inadimplência e pendências. */
  async summary(query: ReportQueryDto, admin?: AuthUser) {
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
    const result = {
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
    if (!admin || !query.formato || query.formato === 'json') return result;
    const indicators: Row[] = [
      { indicador: 'Receita bruta (pagamentos confirmados)', valor: result.receitaBruta },
      { indicador: 'Custo dos jogos (vai para a CAIXA)', valor: result.custoJogos },
      { indicador: 'Taxa de administração (receita da plataforma)', valor: result.taxaAdministracao },
      { indicador: 'Comissões de afiliados (a pagar)', valor: result.comissoes.pendente },
      { indicador: 'Comissões de afiliados (pagas)', valor: result.comissoes.paga },
      { indicador: 'Resultado líquido da plataforma', valor: result.resultadoLiquidoPlataforma },
      { indicador: 'Pagamentos confirmados', valor: result.pagamentosConfirmados },
      { indicador: 'Ticket médio', valor: result.ticketMedio },
      { indicador: 'A receber (reservas dentro do prazo)', valor: result.aReceber.valorAguardando },
      { indicador: 'Vencido (reservas expiradas)', valor: result.aReceber.valorVencido },
      { indicador: 'Pagamentos sem cota (estornar)', valor: result.pagamentosSemCotaParaEstorno },
    ];
    const indicatorColumns: Column[] = [{ key: 'indicador', header: 'Indicador', width: 50 }, { key: 'valor', header: 'Valor', type: 'text', width: 22 }];
    const display: Row[] = indicators.map((row, index) => ({ indicador: row.indicador, valor: index === 6 || index === 10 ? String(row.valor) : brl(Number(row.valor)) }));
    const methodRows: Row[] = result.porMetodo.map((row) => ({ metodo: NAMES[row.metodo] ?? row.metodo, pagamentos: row.pagamentos, valor: row.valor }));
    const methodColumns: Column[] = [{ key: 'metodo', header: 'Forma de pagamento', width: 30 }, { key: 'pagamentos', header: 'Pagamentos', type: 'int', sum: true }, { key: 'valor', header: 'Valor', type: 'money', sum: true }];
    const statusRows: Row[] = result.cotasPorStatus.map((row) => ({ status: row.status, registros: row.registros, cotas: row.cotas }));
    const statusColumns: Column[] = [{ key: 'status', header: 'Situação da cota', width: 30 }, { key: 'registros', header: 'Reservas/vendas', type: 'int', sum: true }, { key: 'cotas', header: 'Cotas', type: 'int', sum: true }];
    const pdf: PdfSpec = {
      title: 'Resumo executivo',
      subtitle: 'Receita, o que fica com a plataforma, comissões, valores a receber e pendências do período.',
      kpis: [
        { label: 'Receita bruta', value: brl(result.receitaBruta), hint: `${result.pagamentosConfirmados} pagamentos` },
        { label: 'Custo dos jogos', value: brl(result.custoJogos) },
        { label: 'Taxa de administração', value: brl(result.taxaAdministracao) },
        { label: 'Comissões', value: brl(result.comissoes.total) },
        { label: 'Resultado da plataforma', value: brl(result.resultadoLiquidoPlataforma) },
      ],
      sections: [
        { title: 'Indicadores', columns: indicatorColumns, rows: display },
        { title: 'Por forma de pagamento', columns: methodColumns, rows: methodRows },
        { title: 'Cotas por situação', columns: statusColumns, rows: statusRows },
      ],
    };
    return this.deliver(admin, 'resumo', query, 'resumo-bolao-livre', [
      { name: 'Indicadores', columns: [{ key: 'indicador', header: 'Indicador', width: 50 }, { key: 'valor', header: 'Valor', type: 'text', width: 22 }], rows: indicators.map((row) => ({ indicador: row.indicador, valor: typeof row.valor === 'number' ? row.valor : String(row.valor) })) },
      { name: 'Por forma', columns: methodColumns, rows: methodRows },
      { name: 'Cotas por situação', columns: statusColumns, rows: statusRows },
    ], pdf);

  }

  /** Controle de cotas por bolão: vendidas, pagas, aguardando, livres, participantes e receita. */
  async pools(query: ReportQueryDto, admin?: AuthUser): Promise<Row[] | ReportFile | { json: true }> {
    const range = this.range(query);
    const pools = await this.prisma.bolao.findMany({ where: { ...(range ? { criadoEm: range } : {}) }, include: { concurso: true, grupo: { select: { nome: true } } }, orderBy: { criadoEm: 'desc' }, take: this.limit(query) > 500 ? 3000 : 300 });
    const ids = pools.map((pool) => pool.id);
    const grouped = await this.prisma.cota.groupBy({ by: ['bolaoId', 'status'], where: { bolaoId: { in: ids } }, _sum: { quantidade: true, valorPago: true } });
    const buyers = await this.prisma.cota.findMany({ where: { bolaoId: { in: ids }, status: { in: PAID_STATUSES } }, select: { bolaoId: true, compradorId: true } });
    const buyersByPool = new Map<string, Set<string>>();
    for (const buyer of buyers) buyersByPool.set(buyer.bolaoId, (buyersByPool.get(buyer.bolaoId) ?? new Set()).add(buyer.compradorId));
    const rows: Row[] = pools.map((pool) => {
      const own = grouped.filter((row) => row.bolaoId === pool.id);
      const qty = (statuses: StatusCota[]) => own.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + (row._sum.quantidade ?? 0), 0);
      const paidValue = own.filter((row) => PAID_STATUSES.includes(row.status)).reduce((sum, row) => sum + Number(row._sum.valorPago ?? 0), 0);
      const paid = qty(PAID_STATUSES);
      const waiting = qty([StatusCota.reservada]);
      const unlimited = pool.cotasIlimitadas || pool.totalCotas === null;
      return {
        id: pool.id, status: pool.status, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, sorteio: pool.concurso.dataSorteio, grupo: pool.grupo.nome,
        valorCota: Number(pool.valorCota), totalCotas: pool.totalCotas, cotasIlimitadas: pool.cotasIlimitadas,
        cotasPagas: paid, cotasAguardando: waiting, cotasCanceladas: qty([StatusCota.cancelada, StatusCota.estornada]),
        cotasLivres: unlimited ? null : Math.max((pool.totalCotas ?? 0) - paid - waiting, 0),
        percentualVendido: unlimited || !pool.totalCotas ? null : Math.round((paid / pool.totalCotas) * 1000) / 10,
        participantes: buyersByPool.get(pool.id)?.size ?? 0,
        aReceber: round2(waiting * Number(pool.valorCota)),
        receita: round2(paidValue),
        gatilhoLiberacao: pool.premioMinimoLiberacao === null ? null : Number(pool.premioMinimoLiberacao),
        liberado: pool.premioMinimoLiberacao === null ? null : Boolean(pool.liberadoEm) || Number(pool.concurso.valorEstimadoPremio ?? 0) >= Number(pool.premioMinimoLiberacao),
      };
    });
    if (!admin || !query.formato || query.formato === 'json') return rows;
    const columns: Column[] = [
      { key: 'modalidade', header: 'Modalidade' }, { key: 'concurso', header: 'Concurso', type: 'int', width: 11 }, { key: 'sorteio', header: 'Sorteio', type: 'date' }, { key: 'grupo', header: 'Grupo', width: 22 },
      { key: 'status', header: 'Situação' }, { key: 'valorCota', header: 'Valor da cota', type: 'money' }, { key: 'totalCotas', header: 'Total de cotas', type: 'int', width: 12 },
      { key: 'cotasPagas', header: 'Cotas pagas', type: 'int', width: 12, sum: true }, { key: 'cotasAguardando', header: 'Aguardando pgto.', type: 'int', width: 14, sum: true }, { key: 'cotasCanceladas', header: 'Canceladas', type: 'int', width: 12, sum: true },
      { key: 'cotasLivres', header: 'Cotas livres', type: 'int', width: 12 }, { key: 'percentualVendido', header: '% vendido', width: 10 }, { key: 'participantes', header: 'Participantes', type: 'int', width: 13, sum: true },
      { key: 'aReceber', header: 'A receber', type: 'money', sum: true }, { key: 'receita', header: 'Receita paga', type: 'money', sum: true },
      { key: 'gatilhoLiberacao', header: 'Gatilho de liberação', type: 'money' }, { key: 'liberado', header: 'Liberado?' }, { key: 'id', header: 'ID do bolão', width: 38 },
    ];
    const pdf: PdfSpec = {
      title: 'Controle de cotas por bolão',
      subtitle: 'Para cada bolão: cotas pagas, aguardando pagamento, livres, quantidade de participantes e receita.',
      kpis: [
        { label: 'Bolões', value: String(rows.length) },
        { label: 'Cotas pagas', value: String(rows.reduce((sum, row) => sum + Number(row.cotasPagas ?? 0), 0)) },
        { label: 'Aguardando pagamento', value: String(rows.reduce((sum, row) => sum + Number(row.cotasAguardando ?? 0), 0)) },
        { label: 'A receber', value: brl(rows.reduce((sum, row) => sum + Number(row.aReceber ?? 0), 0)) },
        { label: 'Receita paga', value: brl(rows.reduce((sum, row) => sum + Number(row.receita ?? 0), 0)) },
      ],
      sections: [{ title: 'Bolões', columns: pick(columns, ['modalidade', 'concurso', 'sorteio', 'grupo', 'status', 'valorCota', 'totalCotas', 'cotasPagas', 'cotasAguardando', 'cotasLivres', 'percentualVendido', 'participantes', 'receita'], ['cotasPagas', 'cotasAguardando', 'participantes', 'receita']), rows: rows.map((row) => ({ ...row, percentualVendido: row.percentualVendido === null ? 'ilimitadas' : `${String(row.percentualVendido).replace('.', ',')}%`, cotasLivres: row.cotasLivres === null ? 'ilimitadas' : row.cotasLivres })) }],
    };
    const exportRows = rows.map((row) => ({ ...row, liberado: row.liberado === null ? null : row.liberado ? 'Sim' : 'Não', percentualVendido: row.percentualVendido === null ? 'ilimitadas' : `${String(row.percentualVendido).replace('.', ',')}%`, cotasLivres: row.cotasLivres === null ? 'ilimitadas' : row.cotasLivres }));
    return this.deliver(admin, 'boloes', query, 'controle-cotas-bolao-livre', [{ name: 'Bolões', columns, rows: exportRows }], pdf);
  }

  async sales(query: ReportQueryDto, admin: AuthUser) {
    const full = query.formato === 'csv' || query.formato === 'xlsx';
    const shares = await this.prisma.cota.findMany({ where: this.salesWhere(query), include: SHARE_INCLUDE, orderBy: { criadoEm: 'desc' }, take: this.limit(query) });
    const rows = shares.map((share) => this.shareRow(share, full));
    const paidRows = rows.filter((row) => row.statusPagamento === 'confirmado');
    const pdf: PdfSpec = {
      title: 'Relatório de vendas de cotas',
      subtitle: 'Quem comprou, quantas cotas, quanto pagou e a situação de cada pagamento.',
      kpis: [
        { label: 'Vendas listadas', value: String(rows.length) },
        { label: 'Cotas vendidas', value: String(rows.reduce((sum, row) => sum + Number(row.quantidade ?? 0), 0)) },
        { label: 'Valor total', value: brl(rows.reduce((sum, row) => sum + Number(row.valorTotal ?? 0), 0)) },
        { label: 'Recebido (pago)', value: brl(paidRows.reduce((sum, row) => sum + Number(row.valorTotal ?? 0), 0)), hint: `${paidRows.length} pagamentos confirmados` },
        { label: 'Taxa da plataforma', value: brl(paidRows.reduce((sum, row) => sum + Number(row.taxaAdmin ?? 0), 0)) },
      ],
      sections: [{ title: 'Vendas', columns: pick(SALES_COLUMNS, ['criadoEm', 'modalidade', 'concurso', 'participante', 'cpf', 'quantidade', 'valorTotal', 'statusCota', 'statusPagamento', 'metodo', 'pagoEm', 'taxaAdmin', 'afiliado'], ['quantidade', 'valorTotal', 'taxaAdmin']), rows }],
    };
    const delivered = await this.deliver(admin, 'vendas', query, 'vendas-bolao-livre', [{ name: 'Vendas', columns: SALES_COLUMNS, rows }], pdf);
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
      take: this.limit(query),
    });
    const orphans = await this.prisma.cota.findMany({ where: { status: { in: [StatusCota.cancelada, StatusCota.estornada] }, pagamento: { status: StatusPagamento.confirmado } }, include: SHARE_INCLUDE, orderBy: { criadoEm: 'desc' }, take: 500 });
    const rows = shares.map((share) => this.shareRow(share, full));
    const orphanRows = orphans.map((share) => ({ ...this.shareRow(share, full), situacao: 'Pago sem cota — estornar ao participante' }));
    const columns: Column[] = [...SALES_COLUMNS.slice(0, 25)];
    const pdf: PdfSpec = {
      title: 'Relatório de cotas não pagas (inadimplência)',
      subtitle: 'Reservas aguardando pagamento ou vencidas, para cobrança. Pagamentos recebidos sem cota aparecem na segunda tabela e devem ser estornados.',
      kpis: [
        { label: 'Reservas em aberto', value: String(rows.length) },
        { label: 'Valor a receber', value: brl(rows.reduce((sum, row) => sum + Number(row.valorTotal ?? 0), 0)) },
        { label: 'Pagos sem cota (estornar)', value: String(orphanRows.length) },
      ],
      sections: [
        { title: 'Aguardando pagamento / vencidas', columns: pick(SALES_COLUMNS, ['criadoEm', 'modalidade', 'concurso', 'participante', 'telefone', 'email', 'quantidade', 'valorTotal', 'statusCota', 'metodo', 'vencimento'], ['quantidade', 'valorTotal']), rows },
        { title: 'Pagamentos recebidos sem cota (estornar ao participante)', columns: pick(SALES_COLUMNS, ['criadoEm', 'concurso', 'participante', 'telefone', 'email', 'valorTotal', 'metodo', 'pagoEm'], ['valorTotal']), rows: orphanRows, emptyText: 'Nenhum pagamento órfão. Tudo conciliado.' },
      ],
    };
    const delivered = await this.deliver(admin, 'inadimplencia', query, 'nao-pagos-bolao-livre', [
      { name: 'Não pagos', columns, rows },
      { name: 'Pagos sem cota (estornar)', columns: [...columns, { key: 'situacao', header: 'Situação', width: 40 }], rows: orphanRows },
    ], pdf);
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
    const unlimited = pool.cotasIlimitadas || pool.totalCotas === null;
    const free = unlimited ? null : Math.max((pool.totalCotas ?? 0) - summary.cotasPagas - summary.cotasAguardando, 0);
    const soldPct = unlimited || !pool.totalCotas ? null : Math.round((summary.cotasPagas / pool.totalCotas) * 1000) / 10;
    const gate = evaluateReleaseGate({ premioMinimoLiberacao: pool.premioMinimoLiberacao, liberadoEm: pool.liberadoEm, premioAtual: pool.concurso.valorEstimadoPremio });
    let interested = 0;
    if (gate.condicional) { try { interested = await this.prisma.bolaoInteresse.count({ where: { bolaoId: pool.id } }); } catch { /* informativo */ } }
    const text = (value: string | number | null | Date): string => (value instanceof Date ? formatDateBr(value) : value === null ? '—' : String(value));
    const summaryRows: Row[] = [
      ['Modalidade', summary.modalidade], ['Concurso', summary.concurso], ['Data do sorteio', formatDateBr(summary.sorteio)], ['Grupo', summary.grupo], ['Situação do bolão', summary.status],
      ['Valor da cota', brl(summary.valorCota)], ['Taxa de administração', `${summary.taxaAdministracaoPct}%`], ['Total de cotas', unlimited ? 'ilimitadas' : summary.totalCotas],
      ['Cotas pagas', summary.cotasPagas], ['Cotas aguardando pagamento', summary.cotasAguardando], ['Cotas livres', free === null ? 'ilimitadas' : free], ['% vendido', soldPct === null ? '—' : `${soldPct}%`],
      ['Participantes (pagos)', summary.participantesPagos], ['Receita bruta (paga)', brl(summary.receitaBruta)], ['Custo dos jogos', brl(summary.custoJogos)],
      ['Taxa de administração (plataforma)', brl(summary.taxaAdministracao)], ['Comissões de afiliados', brl(summary.comissoes)], ['Fica com a plataforma', brl(round2(summary.taxaAdministracao - summary.comissoes))],
      ...(gate.condicional ? [['Gatilho de liberação (prêmio)', brl(gate.gatilho ?? 0)], ['Prêmio estimado atual', gate.premioAtual === null ? '—' : brl(gate.premioAtual)], ['Cotas liberadas?', gate.liberado ? 'Sim' : 'Não'], ['Pessoas que pediram aviso (avise-me)', interested]] : []),
    ].map(([campo, valor]) => ({ campo: String(campo), valor: text(valor as string | number) }));
    const games = pool.jogos.map((game) => ({ ordem: game.ordem, dezenas: game.numeros.map((n) => String(n).padStart(2, '0')).join(' '), quantidade: game.quantidadeDezenas, custo: Number(game.custo) }));
    const totalCotas = unlimited ? 'ilimitadas' : String(pool.totalCotas);
    const pdf: PdfSpec = {
      title: `Ficha do bolão — ${pool.concurso.modalidade} concurso ${pool.concurso.numeroConcurso}`,
      subtitle: `Grupo ${pool.grupo.nome} · situação: ${pool.status} · cota de ${brl(Number(pool.valorCota))} · taxa de administração ${Number(pool.taxaAdministracaoPct)}%`,
      kpis: [
        { label: 'Cotas pagas', value: String(summary.cotasPagas), hint: `de ${totalCotas}` },
        { label: 'Aguardando pagamento', value: String(summary.cotasAguardando) },
        { label: 'Participantes (pagos)', value: String(summary.participantesPagos) },
        { label: 'Receita bruta', value: brl(summary.receitaBruta) },
        { label: 'Fica com a plataforma', value: brl(round2(summary.taxaAdministracao - summary.comissoes)), hint: `taxa ${brl(summary.taxaAdministracao)} - comissões ${brl(summary.comissoes)}` },
      ],
      sections: [
        { title: 'Participantes: quem comprou, quantas cotas e quem pagou', columns: pick(SALES_COLUMNS, ['participante', 'cpf', 'telefone', 'quantidade', 'valorTotal', 'statusCota', 'statusPagamento', 'metodo', 'pagoEm', 'afiliado'], ['quantidade', 'valorTotal']), rows },
        { title: 'Jogos do bolão', columns: [{ key: 'ordem', header: 'Jogo', type: 'int', width: 6 }, { key: 'dezenas', header: 'Dezenas', width: 60 }, { key: 'quantidade', header: 'Qtd. dezenas', type: 'int', width: 10 }, { key: 'custo', header: 'Custo', type: 'money', width: 12, sum: true }], rows: games },
      ],
    };
    const delivered = await this.deliver(admin, 'bolao', query, `bolao-${pool.concurso.modalidade}-${pool.concurso.numeroConcurso}-${id.slice(0, 8)}`, [
      { name: 'Participantes', columns: SALES_COLUMNS, rows },
      { name: 'Resumo', columns: [{ key: 'campo', header: 'Indicador', width: 28 }, { key: 'valor', header: 'Valor', width: 30 }], rows: summaryRows },
      { name: 'Jogos', columns: [{ key: 'ordem', header: 'Jogo', type: 'int', width: 8 }, { key: 'dezenas', header: 'Dezenas', width: 50 }, { key: 'quantidade', header: 'Qtd. dezenas', type: 'int' }, { key: 'custo', header: 'Custo', type: 'money' }], rows: games },
    ], pdf);
    return 'json' in delivered ? { resumo: { ...summary, cotasLivres: free, percentualVendido: soldPct }, liberacao: { ...gate, interessados: interested }, jogos: games, colunas: SALES_COLUMNS, linhas: rows } : delivered;
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
    const pdf: PdfSpec = {
      title: 'Relatório de comissões de afiliados',
      subtitle: 'Valores a pagar, pagos e cancelados por afiliado, calculados sobre a taxa de administração.',
      kpis: [
        { label: 'Afiliados', value: String(rows.length) },
        { label: 'A pagar', value: brl(rows.reduce((sum, row) => sum + Number(row.pendente ?? 0), 0)) },
        { label: 'Já pago', value: brl(rows.reduce((sum, row) => sum + Number(row.paga ?? 0), 0)) },
        { label: 'Total devido + pago', value: brl(rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0)) },
      ],
      sections: [{ title: 'Comissões por afiliado', columns: pick(columns, ['afiliado', 'codigo', 'chavePix', 'percentual', 'vendas', 'base', 'pendente', 'paga', 'cancelada', 'total'], ['vendas', 'base', 'pendente', 'paga', 'cancelada', 'total']), rows }],
    };
    const delivered = await this.deliver(admin, 'comissoes', query, 'comissoes-bolao-livre', [{ name: 'Comissões', columns, rows }], pdf);
    return 'json' in delivered ? { colunas: columns, linhas: rows, total: rows.length } : delivered;
  }

  /** Conciliação financeira: um registro por pagamento, com decomposição (custo, taxa, comissão) e situação da nota fiscal. */
  async payments(query: ReportQueryDto, admin: AuthUser) {
    const full = query.formato === 'csv' || query.formato === 'xlsx';
    const range = this.range(query);
    const items = await this.prisma.pagamento.findMany({
      where: {
        ...(range ? { criadoEm: range } : {}),
        ...(query.statusPagamento && query.statusPagamento !== 'sem_pagamento' ? { status: query.statusPagamento as StatusPagamento } : {}),
        ...(query.metodo ? { metodo: query.metodo as MetodoPagamento } : {}),
        ...(query.bolaoId || query.afiliadoId ? { cota: { ...(query.bolaoId ? { bolaoId: query.bolaoId } : {}), ...(query.afiliadoId ? { afiliadoReferenciaId: query.afiliadoId } : {}) } } : {}),
      },
      include: { notaFiscal: true, cota: { include: { comprador: true, bolao: { include: { concurso: true } }, afiliadoReferencia: true, comissao: true } } },
      orderBy: { criadoEm: 'desc' },
      take: this.limit(query),
    });
    const rows: Row[] = items.map((item) => {
      const confirmed = item.status === StatusPagamento.confirmado;
      const commission = item.cota.comissao && item.cota.comissao.status !== StatusComissao.cancelada ? Number(item.cota.comissao.valor) : 0;
      return {
        criadoEm: item.criadoEm,
        confirmadoEm: item.confirmadoEm,
        participante: item.cota.titularNome,
        cpf: full ? formatCpf(item.cota.titularCpf) : maskCpf(item.cota.titularCpf),
        email: item.cota.comprador.email,
        modalidade: item.cota.bolao.concurso.modalidade,
        concurso: item.cota.bolao.concurso.numeroConcurso,
        bolao: item.cota.bolaoId.slice(0, 8),
        quantidade: item.cota.quantidade,
        metodo: item.metodo,
        provedor: item.pspProvedor,
        cobranca: item.pspTransactionId,
        origem: item.origem,
        formaBaixa: item.formaBaixa,
        status: item.status,
        statusCota: item.cota.status,
        valorBruto: Number(item.valorBruto),
        custoBilhete: confirmed ? Number(item.valorCustoBilhete) : null,
        taxaAdmin: confirmed ? Number(item.valorTaxaAdmin) : null,
        comissao: confirmed ? commission : null,
        resultadoPlataforma: confirmed ? round2(Number(item.valorTaxaAdmin) - commission) : null,
        vencimento: item.vencimentoEm,
        notaFiscal: item.notaFiscal ? item.notaFiscal.status : confirmed ? 'sem nota' : null,
        numeroNota: item.notaFiscal?.numero ?? null,
        observacao: item.observacao,
      };
    });
    const columns: Column[] = [
      { key: 'criadoEm', header: 'Criado em', type: 'date' }, { key: 'confirmadoEm', header: 'Confirmado em', type: 'date' },
      { key: 'participante', header: 'Participante', width: 30 }, { key: 'cpf', header: 'CPF', width: 16 }, { key: 'email', header: 'E-mail', width: 30 },
      { key: 'modalidade', header: 'Modalidade' }, { key: 'concurso', header: 'Concurso', type: 'int', width: 11 }, { key: 'bolao', header: 'Bolão (ID)', width: 12 }, { key: 'quantidade', header: 'Qtd. cotas', type: 'int', width: 10 },
      { key: 'metodo', header: 'Forma' }, { key: 'provedor', header: 'Provedor' }, { key: 'cobranca', header: 'ID da cobrança', width: 28 }, { key: 'origem', header: 'Origem' }, { key: 'formaBaixa', header: 'Forma da baixa manual' },
      { key: 'status', header: 'Pagamento' }, { key: 'statusCota', header: 'Cota' },
      { key: 'valorBruto', header: 'Valor bruto', type: 'money' }, { key: 'custoBilhete', header: 'Custo dos jogos', type: 'money' }, { key: 'taxaAdmin', header: 'Taxa de administração', type: 'money' },
      { key: 'comissao', header: 'Comissão', type: 'money' }, { key: 'resultadoPlataforma', header: 'Resultado da plataforma', type: 'money' },
      { key: 'vencimento', header: 'Vencimento', type: 'date' }, { key: 'notaFiscal', header: 'Nota fiscal' }, { key: 'numeroNota', header: 'Nº da nota', width: 14 }, { key: 'observacao', header: 'Observação', width: 30 },
    ];
    const confirmedRows = rows.filter((row) => row.status === 'confirmado');
    const sumOf = (list: Row[], key: string) => list.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
    const pdf: PdfSpec = {
      title: 'Conciliação financeira de pagamentos',
      subtitle: 'Para cada pagamento: quanto foi pago, quanto vai para os jogos, quanto fica com a plataforma e quanto vai para o afiliado.',
      kpis: [
        { label: 'Pagamentos confirmados', value: String(confirmedRows.length), hint: `de ${rows.length} listados` },
        { label: 'Valor bruto recebido', value: brl(sumOf(confirmedRows, 'valorBruto')) },
        { label: 'Custo dos jogos', value: brl(sumOf(confirmedRows, 'custoBilhete')) },
        { label: 'Taxa de administração', value: brl(sumOf(confirmedRows, 'taxaAdmin')) },
        { label: 'Resultado da plataforma', value: brl(sumOf(confirmedRows, 'resultadoPlataforma')), hint: 'taxa menos comissões' },
      ],
      sections: [{ title: 'Pagamentos', columns: pick(columns, ['confirmadoEm', 'participante', 'modalidade', 'concurso', 'metodo', 'status', 'valorBruto', 'custoBilhete', 'taxaAdmin', 'comissao', 'resultadoPlataforma', 'notaFiscal'], ['valorBruto', 'custoBilhete', 'taxaAdmin', 'comissao', 'resultadoPlataforma']), rows }],
    };
    const delivered = await this.deliver(admin, 'pagamentos', query, 'pagamentos-bolao-livre', [{ name: 'Pagamentos', columns, rows }], pdf);
    return 'json' in delivered ? { colunas: columns, linhas: rows, total: rows.length } : delivered;
  }

  /** Notas fiscais de serviço: situação, número, valor, ISS estimado e pendências de emissão. */
  async invoices(query: ReportQueryDto, admin: AuthUser) {
    const full = query.formato === 'csv' || query.formato === 'xlsx';
    const range = this.range(query);
    const notes = await this.prisma.notaFiscal.findMany({
      where: { ...(range ? { criadoEm: range } : {}), ...(query.statusNota ? { status: query.statusNota as StatusNotaFiscal } : {}) },
      include: { pagamento: { include: { cota: { include: { comprador: true, bolao: { include: { concurso: true } } } } } } },
      orderBy: { criadoEm: 'desc' },
      take: this.limit(query),
    });
    const rows: Row[] = notes.map((note) => {
      const iss = note.issPct ? round2(Number(note.valor) * Number(note.issPct) / 100) : null;
      return {
        criadoEm: note.criadoEm, emitidaEm: note.emitidaEm, status: note.status, origem: note.origem, numero: note.numero,
        participante: note.pagamento.cota.titularNome, cpf: full ? formatCpf(note.pagamento.cota.titularCpf) : maskCpf(note.pagamento.cota.titularCpf), email: note.pagamento.cota.comprador.email,
        modalidade: note.pagamento.cota.bolao.concurso.modalidade, concurso: note.pagamento.cota.bolao.concurso.numeroConcurso,
        valorNota: Number(note.valor), issPct: note.issPct ? Number(note.issPct) : null, issEstimado: iss, taxaAdmin: Number(note.pagamento.valorTaxaAdmin),
        cobranca: note.pagamento.pspTransactionId, notaId: note.provedorId, pdf: note.pdfUrl, erro: note.erro, observacao: note.observacao,
      };
    });
    const columns: Column[] = [
      { key: 'criadoEm', header: 'Solicitada em', type: 'date' }, { key: 'emitidaEm', header: 'Emitida em', type: 'date' }, { key: 'status', header: 'Situação' }, { key: 'origem', header: 'Origem' }, { key: 'numero', header: 'Nº da nota', width: 14 },
      { key: 'participante', header: 'Tomador', width: 30 }, { key: 'cpf', header: 'CPF', width: 16 }, { key: 'email', header: 'E-mail', width: 30 },
      { key: 'modalidade', header: 'Modalidade' }, { key: 'concurso', header: 'Concurso', type: 'int', width: 11 },
      { key: 'valorNota', header: 'Valor da nota', type: 'money' }, { key: 'issPct', header: 'ISS %', width: 8 }, { key: 'issEstimado', header: 'ISS estimado', type: 'money' }, { key: 'taxaAdmin', header: 'Taxa de administração do pagamento', type: 'money', width: 22 },
      { key: 'cobranca', header: 'ID da cobrança', width: 28 }, { key: 'notaId', header: 'ID da nota (Cora)', width: 28 }, { key: 'pdf', header: 'PDF', width: 40 }, { key: 'erro', header: 'Erro', width: 40 }, { key: 'observacao', header: 'Observação', width: 30 },
    ];
    const pendingCount = await this.prisma.pagamento.count({ where: { status: StatusPagamento.confirmado, notaFiscal: null, ...(range ? { confirmadoEm: range } : {}) } });
    const pdf: PdfSpec = {
      title: 'Relatório de notas fiscais de serviço',
      subtitle: 'Notas emitidas sobre a taxa de administração da plataforma.',
      kpis: [
        { label: 'Notas listadas', value: String(rows.length) },
        { label: 'Valor das notas', value: brl(rows.reduce((sum, row) => sum + Number(row.valorNota ?? 0), 0)) },
        { label: 'ISS estimado', value: brl(rows.reduce((sum, row) => sum + Number(row.issEstimado ?? 0), 0)) },
        { label: 'Pagamentos sem nota', value: String(pendingCount) },
      ],
      sections: [{ title: 'Notas fiscais', columns: pick(columns, ['criadoEm', 'emitidaEm', 'status', 'numero', 'participante', 'modalidade', 'concurso', 'valorNota', 'issEstimado'], ['valorNota', 'issEstimado']), rows }],
    };
    const delivered = await this.deliver(admin, 'notas-fiscais', query, 'notas-fiscais-bolao-livre', [{ name: 'Notas fiscais', columns, rows }], pdf);
    return 'json' in delivered ? { colunas: columns, linhas: rows, total: rows.length, pagamentosSemNota: pendingCount } : delivered;
  }
}
