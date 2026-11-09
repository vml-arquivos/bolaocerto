'use client';

import { money, dateTime, statusLabel, statusClass, SectionHeading, Kpi, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function PaymentsView({ ctx }: { ctx: AdminCtx }) {
  const { view, items } = ctx;
  const title = view === 'pagamentos' ? 'Pagamentos' : 'Recebimentos';
  return <><SectionHeading title={title} /><div className="admin-kpi-grid admin-kpi-grid-four"><Kpi label="Confirmados" value={items.filter((item) => item.status === 'confirmado').length} tone="green" /><Kpi label="Pendentes" value={items.filter((item) => item.status === 'pendente').length} tone="amber" /><Kpi label="Falhos" value={items.filter((item) => item.status === 'falhou').length} tone="rose" /><Kpi label="Estornados" value={items.filter((item) => item.status === 'estornado').length} /></div><Panel title="Transações"><Table minWidth={1220}><thead><tr><th>Data</th><th>Transação</th><th>Usuário</th><th>Cota</th><th>Método</th><th>Valor</th><th>Taxa</th><th>Comissão</th><th>Provedor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><code>{item.pspTransactionId ?? item.id?.slice(0, 8)}</code></td><td>{item.cota?.comprador?.nome ?? '—'}</td><td>{item.cotaId?.slice(0, 8)}</td><td>{statusLabel(item.metodo ?? 'pix')}</td><td>{money(item.valorBruto)}</td><td>{money(item.valorTaxaAdmin)}</td><td>{money(item.valorComissaoAfiliado)}</td><td>{item.pspProvedor}</td><td>{dateTime(item.vencimentoEm)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum recebimento" />}</Panel></>;
}
