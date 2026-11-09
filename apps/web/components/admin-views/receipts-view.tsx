'use client';

import { modalityNames } from '../../lib/domain';
import { dateTime, statusLabel, statusClass, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function ReceiptsView({ ctx }: { ctx: AdminCtx }) {
  const { items, setAttachFor } = ctx;
  return <><SectionHeading title="Comprovantes" /><Panel title="Comprovantes de bolão"><Table minWidth={980}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas pagas</th><th>Fecha em</th><th>Status</th><th>Comprovante</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>{item.nomeEspecial ? <><strong>{item.nomeEspecial}</strong><br /></> : null}{item.concurso > 0 ? `#${item.concurso}` : 'a definir'}</td><td>{item.jogos}</td><td>{item.cotasPagas}</td><td>{dateTime(item.cutoffAt)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.arquivos > 0 ? <span className="status-chip status-success">{item.arquivos} {item.arquivos === 1 ? 'arquivo' : 'arquivos'}</span> : item.comprovanteUrl ? <a className="admin-text-link" href={item.comprovanteUrl} target="_blank" rel="noreferrer">Abrir link</a> : <span className="status-chip status-warning">Pendente</span>}</td><td><button className={`admin-button admin-button-small ${item.arquivos > 0 || item.comprovanteUrl ? '' : 'admin-button-primary'}`} onClick={() => setAttachFor({ pool: item })}>{item.arquivos > 0 || item.comprovanteUrl ? 'Ver / enviar mais' : 'Enviar comprovante'}</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum comprovante" />}</Panel></>;
}
