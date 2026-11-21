'use client';

import { AffiliateLevelButton, LevelBadge } from '../admin-affiliate-level';
import Link from 'next/link';
import { InviteManager, ManagedUserForm } from '../admin-people-tools';
import { money, statusLabel, statusClass, SectionHeading, Panel, Empty } from './shared';
import type { AdminCtx, RecordValue } from './shared';
import { PersonCard, PersonList } from './person-card';

const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/** Situação do contrato: o assinado eletronicamente vale primeiro; sem ele, o aceite feito no cadastro. */
function ContractChip({ item }: { item: RecordValue }) {
  const contract = item.contrato as RecordValue | null;
  if (contract?.status === 'assinado') return <span className="status-chip status-success" title={`Contrato ${contract.numero}`}>Contrato assinado</span>;
  if (contract?.status === 'aguardando') return <span className="status-chip status-warning" title={`Contrato ${contract.numero}`}>Contrato a assinar</span>;
  if (item.contratoAceitoEm) return <span className="status-chip status-success">Aceite em {new Date(item.contratoAceitoEm).toLocaleDateString('pt-BR')}</span>;
  return <span className="status-chip status-warning">Aguardando aceite</span>;
}

export function AffiliatesView({ ctx }: { ctx: AdminCtx }) {
  const { items, affiliateOptions, setSelectedUser, selectedUser, setToast, load, execute } = ctx;
  return <>
    <SectionHeading title="Afiliados" action={<Link href="/admin?view=convites" className="admin-button admin-button-ghost admin-button-small">Convites emitidos</Link>} />
    <div className="admin-management-grid people-tools">
      <ManagedUserForm mode="affiliate" affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} />
      <InviteManager collapsible affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} />
    </div>
    <Panel title={`Afiliados cadastrados${items.length ? ` · ${items.length}` : ''}`}>
      <PersonList label="Afiliados cadastrados">{items.map((item) => {
        const ind = (item.indicadores ?? {}) as RecordValue;
        const clients = Number(ind.clientes ?? ind.usuariosIndicados ?? 0);
        return <PersonCard
          key={item.id}
          selected={Boolean(selectedUser) && selectedUser === item.usuario?.id}
          name={item.usuario?.nome ?? 'Afiliado'}
          subtitle={item.usuario?.email}
          status={<span className={statusClass(item.statusAprovacao)}>{statusLabel(item.statusAprovacao)}</span>}
          tags={<><LevelBadge info={item.nivel} /><code className="pc-code">{item.codigoAfiliado}</code><span className="status-chip status-info">{Number(item.comissaoPadraoPct ?? 0).toLocaleString('pt-BR')}% de comissão</span><ContractChip item={item} /></>}
          stats={[
            { label: 'Clientes', value: clients, href: `/admin?view=crm&afiliado=${item.id}`, hint: clients ? 'ver lista' : undefined },
            { label: 'Cotas', value: Number(ind.cotas ?? 0) },
            { label: 'Grupos', value: Number(ind.grupos ?? 0) },
            { label: 'A pagar', value: money(ind.pendente), hint: `pago ${money(ind.paga)}` },
          ]}
          actions={<>
            {item.statusAprovacao !== 'aprovado' && <button className="admin-button admin-button-small admin-button-primary" onClick={() => execute(`/api/v1/admin/afiliados/${item.id}/aprovar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoPadraoPct: Number(item.comissaoPadraoPct ?? 10) }) }, 'Afiliado aprovado e papel atualizado.')}>Aprovar</button>}
            <button className="admin-button admin-button-small admin-button-ghost" onClick={() => { const value = window.prompt('Nova comissão percentual (o afiliado será avisado e precisa aceitar o novo contrato):', String(item.comissaoPadraoPct ?? 10)); if (value !== null) void execute(`/api/v1/admin/afiliados/${item.id}/comissao`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoPadraoPct: Number(value) }) }, 'Comissão atualizada.'); }}>Alterar %</button>
            <AffiliateLevelButton affiliateId={item.id} name={item.usuario?.nome ?? 'afiliado'} info={item.nivel} onSaved={(text) => { setToast({ type: 'success', text }); void load(); }} />
            <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setSelectedUser(item.usuario?.id ?? null)}>Editar / excluir</button>
          </>}
          footer={ind.indicados ? <small>{plural(Number(ind.indicados), 'afiliado indicado', 'afiliados indicados')} na rede</small> : undefined}
        />;
      })}</PersonList>
      {!items.length && <Empty title="Nenhum afiliado" />}
    </Panel>
  </>;
}
