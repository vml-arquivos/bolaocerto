'use client';

import { dateTime, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function AuditView({ ctx }: { ctx: AdminCtx }) {
  const { items } = ctx;
  return <><SectionHeading eyebrow="Conta e acesso" title="Histórico" description="O que foi feito no painel, e por quem." /><Panel title="Ações registradas"><Table minWidth={1080}><thead><tr><th>Data</th><th>Evento</th><th>Entidade</th><th>ID</th><th>Ator</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><span className="status-chip">{item.evento}</span></td><td>{item.entidade}</td><td><code>{item.entidadeId?.slice(0, 10)}</code></td><td>{item.ator?.nome ?? 'Sistema'}</td><td><details><summary>Ver</summary><pre>{JSON.stringify(item.payloadAntes ?? null, null, 2)}</pre></details></td><td><details><summary>Ver</summary><pre>{JSON.stringify(item.payloadDepois ?? null, null, 2)}</pre></details></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum evento" description="Ações administrativas e financeiras auditadas aparecerão nesta tabela." />}</Panel></>;
}
