'use client';

import { statusLabel, statusClass, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function PartnersView({ ctx }: { ctx: AdminCtx }) {
  const { items } = ctx;
  return <><SectionHeading title="Lotéricas" /><Panel title="Parceiros cadastrados"><Table minWidth={950}><thead><tr><th>Razão social</th><th>CNPJ</th><th>Código Caixa</th><th>Cidade/UF</th><th>Repasse</th><th>Operador</th><th>Bolões</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.razaoSocial}</strong></td><td>{item.cnpj}</td><td>{item.codigoCaixa ?? '—'}</td><td>{item.cidade}/{item.uf}</td><td>{item.percentualRepasse}%</td><td>{item.usuarioOperacional?.nome ?? '—'}</td><td>{item._count?.boloes ?? 0}</td><td><span className={statusClass(item.statusContrato)}>{statusLabel(item.statusContrato)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma lotérica parceira" />}</Panel></>;
}
