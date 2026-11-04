'use client';

import { modalityNames } from '../../lib/domain';
import { money, dateTime, statusLabel, statusClass, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function OperationView({ ctx }: { ctx: AdminCtx }) {
  const { items, setAttachFor } = ctx;
  return <><SectionHeading eyebrow="Dia a dia" title="Para fazer" description="Bolões que precisam ser apostados ou ter comprovante." /><Panel title="Bolões para apostar"><Table minWidth={1120}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas pagas</th><th>Arrecadação</th><th>Fecha em</th><th>Parceiro</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>#{item.concurso}</td><td>{item.jogos}</td><td>{item.cotasPagas}</td><td>{money(item.arrecadacao)}</td><td>{dateTime(item.cutoffAt)}</td><td>{item.parceiro ?? 'Mandato'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td><button className="admin-button admin-button-small admin-button-primary" onClick={() => setAttachFor({ pool: item })}>Registrar aposta</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nada para fazer" description="Nenhum bolão esperando aposta." />}</Panel></>;
}
