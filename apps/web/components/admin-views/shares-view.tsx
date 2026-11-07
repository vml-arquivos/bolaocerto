'use client';

import { ManualSaleForm, ShareActions } from '../admin-finance-tools';
import { money, dateTime, statusLabel, statusClass, fetchAdmin, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function SharesView({ ctx }: { ctx: AdminCtx }) {
  const { items, setAttachFor, load, notify } = ctx;
  const isFailed = (item: Record<string, any>) => item.status === 'cancelada' || (item.status === 'reservada' && item.expiraReservaEm && new Date(item.expiraReservaEm).getTime() <= Date.now());
  const failedCount = items.filter(isFailed).length;
  async function removeShare(item: Record<string, any>) {
    if (!window.confirm('Excluir o registro desta compra que não se concluiu? Ela não conta como venda.')) return;
    try { await fetchAdmin(`/api/v1/admin/cotas/${item.id}`, { method: 'DELETE' }); notify('success', 'Registro excluído.'); await load(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.'); }
  }
  async function purge() {
    if (!window.confirm(`Excluir os registros das compras que falharam, venceram ou foram canceladas (${failedCount} nesta lista)? Pagamentos confirmados nunca são apagados.`)) return;
    try { const result = await fetchAdmin('/api/v1/admin/cotas/limpar-falhas', { method: 'POST' }); notify('success', `${result.excluidas} registro(s) excluído(s)${result.mantidas ? `; ${result.mantidas} mantido(s) por segurança` : ''}.`); await load(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível limpar.'); }
  }
  return <><SectionHeading eyebrow="Jogos" title="Cotas" description="Quem reservou e quem pagou." /><div style={{ marginBottom: 16 }}><ManualSaleForm onDone={load} notify={notify} /></div><Panel title="Cotas e reservas" action={failedCount > 0 ? <button className="admin-button admin-button-small admin-button-ghost" onClick={() => void purge()}>Limpar compras que falharam ({failedCount})</button> : undefined}><Table minWidth={1320}><thead><tr><th>Titular</th><th>Bolão</th><th>Concurso</th><th>Quantidade</th><th>Valor</th><th>Status</th><th>Afiliado</th><th>Reserva</th><th>Pagamento</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.titularNome}</strong><small>{item.titularCpf}</small></td><td>{item.bolao?.id?.slice(0, 8) ?? '—'}</td><td>{item.bolao?.concurso?.numeroConcurso > 0 ? item.bolao.concurso.numeroConcurso : item.bolao?.concurso ? 'a definir' : '—'}</td><td>{item.quantidade}</td><td>{money(item.valorPago)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.afiliadoReferencia?.codigoAfiliado ?? 'Orgânico'}</td><td>{dateTime(item.expiraReservaEm)}</td><td>{item.pagamento ? <span className={statusClass(item.pagamento.status)}>{statusLabel(item.pagamento.status)}</span> : '—'}</td><td><div className="admin-row-actions"><ShareActions item={item} onDone={load} notify={notify} />{isFailed(item) && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => void removeShare(item)}>Excluir registro</button>}{item.bolao?.id && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setAttachFor({ pool: { id: item.bolao.id, modalidade: item.bolao.concurso?.modalidade, concurso: item.bolao.concurso?.numeroConcurso, status: item.bolao.status }, share: item })}>Recibo</button>}</div></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma cota encontrada" description="As reservas e pagamentos aparecerão nesta fila assim que existirem." />}</Panel></>;
}
