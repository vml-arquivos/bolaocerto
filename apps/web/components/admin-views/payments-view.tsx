'use client';

import { modalityNames } from '../../lib/domain';
import { money, dateTime, statusLabel, statusClass, SectionHeading, Kpi, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

/** Nome do bolão como o cliente vê: modalidade, concurso e grupo. */
function poolLabel(pool: any) {
  const contest = pool?.concurso;
  if (!contest) return '—';
  const name = `${modalityNames[contest.modalidade] ?? contest.modalidade}${contest.nomeEspecial ? ` ${contest.nomeEspecial}` : ''}`;
  return `${name} ${contest.numeroConcurso > 0 ? `#${contest.numeroConcurso}` : '(a definir)'}`;
}

export function PaymentsView({ ctx }: { ctx: AdminCtx }) {
  const { view, items } = ctx;
  const title = view === 'pagamentos' ? 'Pagamentos' : 'Recebimentos';
  return <><SectionHeading title={title} /><div className="admin-kpi-grid admin-kpi-grid-four"><Kpi label="Confirmados" value={items.filter((item) => item.status === 'confirmado').length} tone="green" /><Kpi label="Pendentes" value={items.filter((item) => item.status === 'pendente').length} tone="amber" /><Kpi label="Falhos" value={items.filter((item) => item.status === 'falhou').length} tone="rose" /><Kpi label="Estornados" value={items.filter((item) => item.status === 'estornado').length} /></div><Panel title="Transações"><Table minWidth={1080}><thead><tr><th>Quem comprou</th><th>Bolão</th><th>Vendido por</th><th>Data</th><th>Valor</th><th>Taxa e comissão</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.cota?.comprador?.nome ?? item.cota?.titularNome ?? '—'}</strong>{item.cota?.comprador?.email && <small>{item.cota.comprador.email}</small>}</td><td><span>{poolLabel(item.cota?.bolao)}</span>{item.cota?.bolao?.valorCota !== undefined && <span className="pool-price-tag">{money(item.cota.bolao.valorCota)} <span>/ cota</span></span>}{item.cota?.bolao?.grupo?.nome && <small>{item.cota.bolao.grupo.nome}</small>}<small>{item.cota?.quantidade ?? 1} {(item.cota?.quantidade ?? 1) === 1 ? 'cota' : 'cotas'}</small></td><td>{item.cota?.afiliadoReferencia ? <><span>{item.cota.afiliadoReferencia.usuario?.nome ?? 'Afiliado'}</span><small><code>{item.cota.afiliadoReferencia.codigoAfiliado}</code></small></> : <span className="status-chip">Venda direta</span>}</td><td className="td-nowrap">{dateTime(item.criadoEm)}{item.status === 'pendente' && item.vencimentoEm && <small>vence {dateTime(item.vencimentoEm)}</small>}</td><td className="td-nowrap"><strong>{money(item.valorBruto)}</strong></td><td className="td-nowrap"><span className="nowrap">Taxa {money(item.valorTaxaAdmin)}</span><small>Comissão {money(item.valorComissaoAfiliado)}</small></td><td className="td-nowrap"><span>{statusLabel(item.metodo ?? 'pix')}</span><small><code>{item.pspTransactionId ?? item.id?.slice(0, 8)}</code></small></td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum recebimento" />}</Panel></>;
}
