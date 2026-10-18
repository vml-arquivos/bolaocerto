import { createHmac, timingSafeEqual } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { round2 } from '../common/brazil-time';
import { formatDateBr } from '../reports/export.util';
import { brl, collect, MODALITY_NAMES, PDF_COLORS, PLATFORM_NAME, pdfText, textInMargin } from '../reports/pdf.util';

export { MODALITY_NAMES };
const METHOD_NAMES: Record<string, string> = { pix: 'Pix', boleto: 'Boleto bancário', cartao: 'Cartão de crédito', pix_automatico: 'Pix Automático', manual: 'Baixa manual (confirmada pela administração)' };

export interface ReceiptData {
  numero: string;
  codigoVerificacao: string;
  emitidoEm: Date;
  participante: { nome: string; cpf: string; email: string | null };
  bolao: { id: string; modalidade: string; concurso: number; sorteio: Date; grupo: string; quantidadeCotas: number; valorCota: number; totalCotas: number | null; jogos: Array<{ ordem: number; numeros: number[] }> };
  pagamento: { metodo: string; metodoNome: string; confirmadoEm: Date | null; idCobranca: string | null; origem: string };
  valores: {
    valorPago: number;
    aplicadoNasApostas: number;
    taxaAdministracao: number;
    taxaAdministracaoPct: number;
    comissaoAfiliado: number;
    comissaoAfiliadoPct: number | null;
    afiliadoCodigo: string | null;
    fiqueiPlataforma: number;
    percentuais: { apostas: number; afiliado: number; plataforma: number };
  };
  mandato: { aceitoEm: Date; hash: string | null } | null;
  notaFiscal: { numero: string | null; status: string } | null;
  explicacoes: Array<{ titulo: string; texto: string }>;
}

export function maskCpfDisplay(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11 ? `***.***.${digits.slice(6, 9)}-${digits.slice(9)}` : '***';
}

function secret(): string {
  return process.env.RECEIPT_SECRET || process.env.JWT_ACCESS_SECRET || 'bolao-livre-recibo';
}

/** Código curto de autenticidade (HMAC) – permite conferir o recibo sem expor dados pessoais. */
export function receiptCode(cotaId: string, pagamentoId: string, valorBruto: string): string {
  const digest = createHmac('sha256', secret()).update(`${cotaId}|${pagamentoId}|${valorBruto}`).digest('hex').toUpperCase();
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}`;
}

export function receiptCodeMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected.toUpperCase());
  const b = Buffer.from(provided.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ReceiptSource {
  id: string;
  titularNome: string;
  titularCpf: string;
  quantidade: number;
  comprador: { email: string | null };
  bolao: { id: string; valorCota: { toString(): string }; totalCotas: number | null; cotasIlimitadas: boolean; taxaAdministracaoPct: { toString(): string }; grupo: { nome: string }; concurso: { modalidade: string; numeroConcurso: number; dataSorteio: Date }; jogos: Array<{ ordem: number; numeros: number[] }> };
  pagamento: { id: string; metodo: string; valorBruto: { toString(): string }; valorTaxaAdmin: { toString(): string }; valorCustoBilhete: { toString(): string }; valorComissaoAfiliado: { toString(): string }; confirmadoEm: Date | null; pspTransactionId: string | null; origem: string; notaFiscal: { numero: string | null; status: string } | null };
  comissao: { valor: { toString(): string }; percentual: { toString(): string } | null; status: string } | null;
  afiliadoReferencia: { codigoAfiliado: string } | null;
  mandato: { aceitoEm: Date; textoHash: string } | null;
}

export function buildReceiptData(share: ReceiptSource, now = new Date()): ReceiptData {
  const payment = share.pagamento;
  const gross = round2(Number(payment.valorBruto));
  const cost = round2(Number(payment.valorCustoBilhete));
  const fee = round2(Number(payment.valorTaxaAdmin));
  const commissionActive = share.comissao && share.comissao.status !== 'cancelada' ? round2(Number(share.comissao.valor)) : 0;
  const commission = commissionActive || round2(Number(payment.valorComissaoAfiliado));
  const platform = round2(fee - commission);
  const pct = (value: number) => (gross > 0 ? Math.round((value / gross) * 1000) / 10 : 0);
  const feePct = Number(share.bolao.taxaAdministracaoPct);
  const modality = MODALITY_NAMES[share.bolao.concurso.modalidade] ?? share.bolao.concurso.modalidade;
  const method = METHOD_NAMES[payment.metodo] ?? payment.metodo;
  const commissionPct = share.comissao?.percentual ? Number(share.comissao.percentual) : null;
  const explicacoes = [
    { titulo: 'O que você pagou', texto: `${share.quantidade} cota(s) de ${brl(Number(share.bolao.valorCota))} no bolão da ${modality}, concurso ${share.bolao.concurso.numeroConcurso}. Total pago: ${brl(gross)}.` },
    { titulo: 'Quanto vai para as apostas', texto: `${brl(cost)} (${pct(cost)}% do que você pagou) é a parte aplicada na compra dos jogos do bolão, registrados na CAIXA. É este valor que concorre ao prêmio.` },
    { titulo: 'Taxa de administração da plataforma', texto: `${brl(fee)} (${feePct.toLocaleString('pt-BR')}% sobre o valor aplicado nas apostas, ${pct(fee)}% do total pago). Remunera a organização do bolão, o processamento do pagamento, o registro das apostas, a apuração e o atendimento. A taxa já está incluída no valor da cota: você não paga nada além do total acima.` },
    commission > 0
      ? { titulo: 'Comissão de indicação', texto: `Deste valor de taxa, ${brl(commission)}${commissionPct !== null ? ` (${commissionPct.toLocaleString('pt-BR')}% da taxa)` : ''} é repassado ao afiliado${share.afiliadoReferencia ? ` ${share.afiliadoReferencia.codigoAfiliado}` : ''} que indicou o bolão. A comissão sai da taxa de administração; não aumenta o seu custo.` }
      : { titulo: 'Comissão de indicação', texto: 'Esta participação não teve afiliado indicador, portanto não há comissão de indicação.' },
    { titulo: 'Quanto fica com a plataforma', texto: `${brl(platform)} (${pct(platform)}% do total pago): é a taxa de administração menos a comissão de indicação${commission > 0 ? '' : ' (que não houve)'}.` },
    { titulo: 'Como funciona o prêmio', texto: 'Se o bolão for premiado, o valor é dividido proporcionalmente ao número de cotas pagas. O prêmio é pago diretamente pela CAIXA; a taxa de administração não incide sobre o prêmio.' },
  ];
  return {
    numero: `BL-${share.id.slice(0, 8).toUpperCase()}`,
    codigoVerificacao: receiptCode(share.id, payment.id, payment.valorBruto.toString()),
    emitidoEm: now,
    participante: { nome: share.titularNome, cpf: maskCpfDisplay(share.titularCpf), email: share.comprador.email },
    bolao: { id: share.bolao.id, modalidade: modality, concurso: share.bolao.concurso.numeroConcurso, sorteio: share.bolao.concurso.dataSorteio, grupo: share.bolao.grupo.nome, quantidadeCotas: share.quantidade, valorCota: Number(share.bolao.valorCota), totalCotas: share.bolao.cotasIlimitadas ? null : share.bolao.totalCotas, jogos: share.bolao.jogos.map((game) => ({ ordem: game.ordem, numeros: game.numeros })) },
    pagamento: { metodo: payment.metodo, metodoNome: method, confirmadoEm: payment.confirmadoEm, idCobranca: payment.pspTransactionId, origem: payment.origem },
    valores: { valorPago: gross, aplicadoNasApostas: cost, taxaAdministracao: fee, taxaAdministracaoPct: feePct, comissaoAfiliado: commission, comissaoAfiliadoPct: commissionPct, afiliadoCodigo: share.afiliadoReferencia?.codigoAfiliado ?? null, fiqueiPlataforma: platform, percentuais: { apostas: pct(cost), afiliado: pct(commission), plataforma: pct(platform) } },
    mandato: share.mandato ? { aceitoEm: share.mandato.aceitoEm, hash: share.mandato.textoHash } : null,
    notaFiscal: payment.notaFiscal && payment.notaFiscal.status !== 'cancelada' ? { numero: payment.notaFiscal.numero, status: payment.notaFiscal.status } : null,
    explicacoes,
  };
}

/** Recibo em PDF (A4 retrato) com o detalhamento completo do valor pago. */
export async function buildReceiptPdf(data: ReceiptData, verifyUrl: string | null): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Recibo ${data.numero}`, Author: PLATFORM_NAME, Creator: PLATFORM_NAME, Subject: 'Recibo de participação em bolão' } });
  const done = collect(doc);
  const W = doc.page.width;
  const left = 40;
  const inner = W - 80;
  const bottomLimit = doc.page.height - 60;

  doc.rect(0, 0, W, 64).fill(PDF_COLORS.brand);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16);
  textInMargin(doc, PLATFORM_NAME, left, 16, { width: 260 });
  doc.font('Helvetica').fontSize(9);
  textInMargin(doc, 'RECIBO DE PARTICIPAÇÃO EM BOLÃO', left, 38, { width: 300 });
  doc.font('Helvetica-Bold').fontSize(11);
  textInMargin(doc, `Nº ${data.numero}`, W - left - 220, 18, { width: 220, align: 'right' });
  doc.font('Helvetica').fontSize(8.5);
  textInMargin(doc, `Emitido em ${formatDateBr(data.emitidoEm)}`, W - left - 220, 38, { width: 220, align: 'right' });

  let y = 78;
  doc.save().roundedRect(left, y, inner, 26, 4).fill('#E3F4EA').restore();
  doc.fillColor(PDF_COLORS.accent).font('Helvetica-Bold').fontSize(11);
  textInMargin(doc, `PAGAMENTO CONFIRMADO${data.pagamento.confirmadoEm ? ` em ${formatDateBr(data.pagamento.confirmadoEm)}` : ''}`, left + 12, y + 8, { width: inner - 24 });
  y += 38;

  const heading = (title: string) => {
    if (y + 40 > bottomLimit) { doc.addPage(); y = 50; }
    doc.fillColor(PDF_COLORS.brand).font('Helvetica-Bold').fontSize(10.5);
    textInMargin(doc, pdfText(title).toUpperCase(), left, y, { width: inner });
    y += 14;
    doc.save().moveTo(left, y).lineTo(left + inner, y).lineWidth(0.8).stroke(PDF_COLORS.brand).restore();
    y += 7;
  };
  const pair = (label: string, value: string, x: number, width: number, yy: number) => {
    doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5);
    textInMargin(doc, pdfText(label).toUpperCase(), x, yy, { width });
    doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(9.5);
    textInMargin(doc, pdfText(value), x, yy + 10, { width, ellipsis: true });
  };

  heading('Participante');
  pair('Nome do titular', data.participante.nome, left, inner * 0.5 - 8, y);
  pair('CPF', data.participante.cpf, left + inner * 0.5, inner * 0.25, y);
  pair('Cotas adquiridas', String(data.bolao.quantidadeCotas), left + inner * 0.75, inner * 0.25, y);
  y += 32;

  heading('Bolão');
  pair('Modalidade', data.bolao.modalidade, left, inner * 0.3, y);
  pair('Concurso', String(data.bolao.concurso), left + inner * 0.3, inner * 0.2, y);
  pair('Data do sorteio', formatDateBr(data.bolao.sorteio).slice(0, 10), left + inner * 0.5, inner * 0.25, y);
  pair('Grupo', data.bolao.grupo, left + inner * 0.75, inner * 0.25, y);
  y += 28;
  if (data.bolao.jogos.length) {
    doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5);
    textInMargin(doc, 'JOGOS DO BOLÃO', left, y, { width: inner });
    y += 10;
    doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(8.5);
    for (const game of data.bolao.jogos.slice(0, 8)) {
      textInMargin(doc, `Jogo ${game.ordem}: ${game.numeros.map((n) => String(n).padStart(2, '0')).join(' ')}`, left, y, { width: inner, ellipsis: true });
      y += 11;
    }
    if (data.bolao.jogos.length > 8) { textInMargin(doc, `... e mais ${data.bolao.jogos.length - 8} jogo(s)`, left, y, { width: inner }); y += 11; }
    y += 10;
  }

  heading('Pagamento');
  pair('Forma de pagamento', data.pagamento.metodoNome, left, inner * 0.45, y);
  pair('ID da cobrança', data.pagamento.idCobranca ?? '—', left + inner * 0.45, inner * 0.55, y);
  y += 30;

  heading('Para onde vai o seu dinheiro');
  const rows: Array<{ label: string; value: number; pct: number; color: string; note: string }> = [
    { label: 'Aplicado nas apostas', value: data.valores.aplicadoNasApostas, pct: data.valores.percentuais.apostas, color: PDF_COLORS.brand, note: 'Compra dos jogos do bolão na CAIXA' },
    { label: `Taxa de administração (${data.valores.taxaAdministracaoPct.toLocaleString('pt-BR')}% sobre as apostas)`, value: data.valores.taxaAdministracao, pct: Math.round((data.valores.taxaAdministracao / Math.max(data.valores.valorPago, 0.01)) * 1000) / 10, color: PDF_COLORS.accent, note: 'Remunera a plataforma e eventual afiliado' },
  ];
  const tableHead = () => {
    doc.save().rect(left, y, inner, 18).fill(PDF_COLORS.brand).restore();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    textInMargin(doc, 'ITEM', left + 6, y + 5, { width: inner * 0.62 });
    textInMargin(doc, '% DO TOTAL', left + inner * 0.62, y + 5, { width: inner * 0.15, align: 'right' });
    textInMargin(doc, 'VALOR', left + inner * 0.77, y + 5, { width: inner * 0.23 - 6, align: 'right' });
    y += 18;
  };
  tableHead();
  const line = (label: string, note: string, pctValue: number | null, value: number, opts: { bold?: boolean; indent?: boolean; fill?: string } = {}) => {
    const h = note ? 26 : 18;
    if (opts.fill) doc.save().rect(left, y, inner, h).fill(opts.fill).restore();
    doc.fillColor(PDF_COLORS.text).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    textInMargin(doc, pdfText(label), left + (opts.indent ? 18 : 6), y + 4, { width: inner * 0.62 - (opts.indent ? 18 : 6), ellipsis: true });
    if (note) { doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5); textInMargin(doc, pdfText(note), left + (opts.indent ? 18 : 6), y + 15, { width: inner * 0.62 - 10, ellipsis: true }); }
    doc.fillColor(PDF_COLORS.text).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    textInMargin(doc, pctValue === null ? '' : `${pctValue.toLocaleString('pt-BR')}%`, left + inner * 0.62, y + 4, { width: inner * 0.15, align: 'right' });
    textInMargin(doc, brl(value), left + inner * 0.77, y + 4, { width: inner * 0.23 - 6, align: 'right' });
    doc.save().moveTo(left, y + h).lineTo(left + inner, y + h).lineWidth(0.3).stroke(PDF_COLORS.line).restore();
    y += h;
  };
  line(rows[0]!.label, rows[0]!.note, rows[0]!.pct, rows[0]!.value);
  line(rows[1]!.label, rows[1]!.note, rows[1]!.pct, rows[1]!.value);
  line(data.valores.comissaoAfiliado > 0 ? `Comissão de indicação${data.valores.afiliadoCodigo ? ` (afiliado ${data.valores.afiliadoCodigo})` : ''}` : 'Comissão de indicação (sem afiliado)', 'Sai da taxa de administração; não aumenta o seu custo', data.valores.percentuais.afiliado, data.valores.comissaoAfiliado, { indent: true });
  line('Fica com a plataforma', 'Taxa de administração menos a comissão de indicação', data.valores.percentuais.plataforma, data.valores.fiqueiPlataforma, { indent: true });
  line('TOTAL PAGO PELO PARTICIPANTE', '', null, data.valores.valorPago, { bold: true, fill: PDF_COLORS.brandSoft });
  y += 10;
  // barra proporcional
  const bar = [
    { v: data.valores.percentuais.apostas, c: PDF_COLORS.brand }, { v: data.valores.percentuais.afiliado, c: PDF_COLORS.warn }, { v: data.valores.percentuais.plataforma, c: PDF_COLORS.accent },
  ];
  const totalBar = bar.reduce((sum, item) => sum + item.v, 0) || 1;
  let bx = left;
  for (const item of bar) { const w = (item.v / totalBar) * inner; if (w > 0) doc.save().rect(bx, y, w, 9).fill(item.c).restore(); bx += w; }
  y += 13;
  const legend = [[PDF_COLORS.brand, 'Apostas'], [PDF_COLORS.warn, 'Comissão de indicação'], [PDF_COLORS.accent, 'Plataforma']] as const;
  let lx = left;
  doc.font('Helvetica').fontSize(7.5);
  for (const [color, label] of legend) { doc.save().rect(lx, y + 1, 7, 7).fill(color).restore(); doc.fillColor(PDF_COLORS.muted); textInMargin(doc, label, lx + 10, y, { width: 110 }); lx += 120; }
  y += 18;

  heading('Entenda cada valor');
  for (const item of data.explicacoes) {
    doc.font('Helvetica').fontSize(8.5);
    const h = doc.heightOfString(`${item.titulo}: ${item.texto}`, { width: inner });
    if (y + h + 6 > bottomLimit) { doc.addPage(); y = 50; }
    doc.fillColor(PDF_COLORS.text).font('Helvetica-Bold').fontSize(8.5);
    doc.text(`${pdfText(item.titulo)}: `, left, y, { width: inner, continued: true, lineBreak: true });
    doc.font('Helvetica').fillColor(PDF_COLORS.text).text(pdfText(item.texto), { width: inner, continued: false });
    y = doc.y + 5;
  }

  heading('Autorização e documentos');
  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_COLORS.text);
  const auth = data.mandato
    ? `Você autorizou a plataforma, por mandato eletrônico aceito em ${formatDateBr(data.mandato.aceitoEm)}, a adquirir e registrar as apostas deste bolão. Termo (hash): ${(data.mandato.hash ?? '—').slice(0, 16)}...`
    : 'Participação registrada pela administração, sem aceite eletrônico associado.';
  doc.text(pdfText(auth), left, y, { width: inner });
  y = doc.y + 4;
  doc.text(pdfText(data.notaFiscal ? `Nota fiscal de serviço (taxa de administração): ${data.notaFiscal.numero ? `nº ${data.notaFiscal.numero}` : 'em emissão'} — ${data.notaFiscal.status}.` : 'Nota fiscal de serviço: ainda não emitida ou não aplicável a esta participação.'), left, y, { width: inner });
  y = doc.y + 8;

  if (y + 56 > doc.page.height - 46) { doc.addPage(); y = 50; }
  doc.save().roundedRect(left, y, inner, 52, 4).fillAndStroke(PDF_COLORS.zebra, PDF_COLORS.line).restore();
  doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5);
  textInMargin(doc, 'CÓDIGO DE VERIFICAÇÃO', left + 10, y + 7, { width: 200 });
  doc.fillColor(PDF_COLORS.brand).font('Courier-Bold').fontSize(14);
  textInMargin(doc, data.codigoVerificacao, left + 10, y + 19, { width: 220 });
  doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5);
  textInMargin(doc, pdfText(verifyUrl ? `Confira a autenticidade em: ${verifyUrl}` : 'Confira a autenticidade com o suporte informando este código.'), left + 240, y + 12, { width: inner - 250 });
  doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7);
  textInMargin(doc, 'Este recibo comprova o pagamento da participação no bolão. Não é bilhete lotérico nem garante prêmio. Prêmios são pagos pela CAIXA.', left, doc.page.height - 38, { width: inner, align: 'center' });
  doc.end();
  return done;
}
