'use client';

import Link from 'next/link';
import { money, dateTime, statusLabel, statusClass, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function CommissionsView({ ctx }: { ctx: AdminCtx }) {
  const { items, selectedCommissions, setSelectedCommissions, execute } = ctx;
  const toggle = (id: string) => setSelectedCommissions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <><SectionHeading title="Comissões" action={<Link href="/admin?view=repasses" className="admin-button admin-button-primary">Pagar comissões</Link>} /><Panel title="Comissões pendentes e pagas" action={selectedCommissions.length > 0 ? <button className="admin-button admin-button-primary" onClick={() => execute('/api/v1/admin/repasses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoIds: selectedCommissions }) }, 'Lote de repasse criado.')}>Criar lote ({selectedCommissions.length})</button> : undefined}><Table minWidth={1120}><thead><tr><th><input type="checkbox" aria-label="Selecionar todas" onChange={(event) => setSelectedCommissions(event.target.checked ? items.filter((item) => item.status === 'pendente').map((item) => item.id) : [])} /></th><th>Afiliado</th><th>Cota</th><th>Bolão</th><th>Base</th><th>%</th><th>Comissão</th><th>Status</th><th>Data</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><input type="checkbox" checked={selectedCommissions.includes(item.id)} disabled={item.status !== 'pendente'} onChange={() => toggle(item.id)} aria-label={`Selecionar comissão ${item.id}`} /></td><td>{item.afiliado?.usuario?.nome ?? item.afiliado?.codigoAfiliado}</td><td>{item.cotaId?.slice(0, 8)}</td><td>{item.cota?.bolao?.concurso?.numeroConcurso ? `Concurso ${item.cota.bolao.concurso.numeroConcurso}` : '—'}</td><td>{money(item.baseCalculo)}</td><td>{item.percentual ?? '—'}%</td><td>{money(item.valor)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{dateTime(item.criadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma comissão" />}</Panel></>;
}
