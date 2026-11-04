'use client';

import { money, dateOnly, statusLabel, statusClass, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function RemittancesView({ ctx }: { ctx: AdminCtx }) {
  const { items, execute } = ctx;
  return <><SectionHeading eyebrow="Dinheiro" title="Pagar comissões" description="Junte comissões e registre o Pix enviado." /><Panel title="Pagamentos de comissão"><Table minWidth={980}><thead><tr><th>Código</th><th>Comissões</th><th>Valor total</th><th>Data</th><th>Referência</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.codigo}</code></td><td>{item.comissoes?.length ?? 0}</td><td>{money(item.valorTotal)}</td><td>{dateOnly(item.dataRepasse)}</td><td>{item.referencia ?? '—'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.status !== 'pago' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/repasses/${item.id}/pagar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referencia: window.prompt('Referência do comprovante:', '') || undefined }) }, 'Repasse marcado como pago e comissões atualizadas.')}>Registrar pagamento</button>}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum lote de repasse" description="Selecione comissões pendentes na aba Comissões para gerar um lote." />}</Panel></>;
}
