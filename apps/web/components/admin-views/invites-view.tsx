'use client';

import Link from 'next/link';
import { InviteManager } from '../admin-people-tools';
import { dateTime, statusLabel, statusClass, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function InvitesView({ ctx }: { ctx: AdminCtx }) {
  const { items, affiliateOptions, setToast, load } = ctx;
  return <><SectionHeading title="Convites" /><InviteManager affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><Panel title="Convites emitidos"><Table minWidth={900}><thead><tr><th>Código</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Status</th><th>Expiração</th><th>Link</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.codigo}</code></td><td>{({ afiliado: 'Afiliado', operacao: 'Equipe de operação', admin: 'Administrador' } as Record<string, string>)[item.tipo] ?? 'Usuário'}</td><td>{item.afiliadoOrigem?.codigoAfiliado ?? 'Raiz'}</td><td>{item.emailDestino ?? 'Livre'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{dateTime(item.expiraEm)}</td><td>{item.caminho ? <button className="admin-text-button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${item.caminho}`)}>Copiar link</button> : '—'}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum convite" />}</Panel></>;
}
