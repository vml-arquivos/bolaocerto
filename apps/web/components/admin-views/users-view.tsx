'use client';

import { AffiliateRulesPanel } from '../admin-affiliate-level';
import { ManagedUserForm } from '../admin-people-tools';
import { StaffInvitePanel } from '../staff-invite-panel';
import { ViewAsPicker } from '../admin-view-as';
import { dateOnly, statusLabel, statusClass, SectionHeading, Panel, Empty } from './shared';
import type { AdminCtx } from './shared';
import { PersonCard, PersonList } from './person-card';
import { useState } from 'react';
import { AffiliateFicha } from './affiliate-ficha';
import { ClientFicha } from '../admin-crm-tools';

const ROLE_NAMES: Record<string, string> = { admin: 'Administrador', operacao: 'Operação', afiliado: 'Afiliado', cotista: 'Cliente (cotista)' };

export function UsersView({ ctx }: { ctx: AdminCtx }) {
  const { items, roleTab, setRoleTab, setSelectedUser, selectedUser, setToast, load } = ctx;
  const [ficha, setFicha] = useState<{ tipo: 'afiliado' | 'cliente'; id: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => setToast({ type, text });
  const openEditor = (userId: string) => { setFicha(null); setSelectedUser(userId); };
  const fichaOf = (item: (typeof items)[number]) => (item.afiliado?.id ? { tipo: 'afiliado' as const, id: item.afiliado.id } : item.papel === 'cotista' ? { tipo: 'cliente' as const, id: item.id } : null);
  return <>
    {ficha?.tipo === 'afiliado' && <AffiliateFicha key={ficha.id} id={ficha.id} notify={notify} onClose={() => setFicha(null)} onChanged={() => void load()} onEdit={openEditor} />}
    {ficha?.tipo === 'cliente' && <ClientFicha key={ficha.id} id={ficha.id} notify={notify} onClose={() => setFicha(null)} onChanged={() => void load()} onEdit={openEditor} />}
    <SectionHeading title="Equipe e acessos" />
    {ctx.superAdmin && <details className="admin-rules-shortcut"><summary>Regras dos afiliados: níveis e trava da comissão máxima</summary><AffiliateRulesPanel /></details>}
    <div className="admin-chip-row people-tabs" role="tablist" aria-label="Tipo de conta">{([['equipe', 'Equipe do sistema'], ['afiliado', 'Afiliados'], ['cotista', 'Clientes (cotistas)'], ['todos', 'Todos']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={roleTab === key} className={`admin-chip-button${roleTab === key ? ' is-current' : ''}`} onClick={() => setRoleTab(key)}>{label}</button>)}</div>
    <div className="admin-management-grid people-tools">
      <ManagedUserForm mode="user" onDone={load} onNotice={(text) => setToast({ type: 'success', text })} />
      {ctx.superAdmin && <ViewAsPicker />}
    </div>
    <StaffInvitePanel onNotice={(text) => setToast({ type: 'success', text })} />
    <Panel title={`Contas cadastradas${items.length ? ` · ${items.length}` : ''}`}>
      <PersonList label="Contas cadastradas">{items.map((item) => <PersonCard
        key={item.id}
        selected={selectedUser === item.id}
        tone={item.desativadoEm ? 'muted' : undefined}
        avatar={item.nome}
        name={fichaOf(item) ? <button type="button" className="pc-name-button" onClick={() => setFicha(fichaOf(item))}>{item.nome}</button> : item.nome}
        subtitle={item.email}
        status={<span className={`status-chip role-chip role-${item.papel}`}>{ROLE_NAMES[item.papel] ?? item.papel}</span>}
        tags={<>{item.desativadoEm ? <span className="status-chip status-danger">Acesso removido</span> : <span className="status-chip status-success">Ativo</span>}<span className={statusClass(item.statusKyc)}>Verificação: {statusLabel(item.statusKyc)}</span>{item.afiliado?.codigoAfiliado && <code className="pc-code">{item.afiliado.codigoAfiliado}</code>}</>}
        stats={[
          { label: 'CPF', value: item.cpf ?? '—' },
          { label: 'Cadastro', value: dateOnly(item.criadoEm) },
          { label: 'Cotas', value: item._count?.cotasCompradas ?? 0 },
        ]}
        actions={<>{fichaOf(item) && <button className="admin-button admin-button-small admin-button-primary" onClick={() => setFicha(fichaOf(item))}>Ver ficha</button>}<button className="admin-button admin-button-small admin-button-ghost" onClick={() => setSelectedUser(item.id)}>Editar / excluir</button></>}
      />)}</PersonList>
      {!items.length && <Empty title="Ninguém nesta lista" />}
    </Panel>
  </>;
}
