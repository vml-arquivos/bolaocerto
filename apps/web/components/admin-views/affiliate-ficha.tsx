'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminDrawer } from '../admin-drawer';
import { IdentityReview } from '../admin-contracts';
import { LevelBadge } from '../admin-affiliate-level';
import { dateOnly, dateTime, fetchAdmin, money, statusClass, statusLabel } from './shared';
import type { RecordValue } from './shared';
import { FichaEmpty, FichaGrid, FichaHead, FichaSection, FichaStats, InfoList, KYC_TEXT, phoneText } from './ficha';

type Notify = (type: 'success' | 'error', text: string) => void;
const CONTRACT_STATUS: Record<string, [string, string]> = { aguardando: ['A assinar', 'status-chip status-warning'], assinado: ['Assinado', 'status-chip status-success'], cancelado: ['Cancelado', 'status-chip status-danger'] };
const COMMISSION_STATUS: Record<string, [string, string]> = { pendente: ['A pagar', 'status-chip status-warning'], paga: ['Paga', 'status-chip status-success'], cancelada: ['Cancelada', 'status-chip status-danger'] };

/** Ficha completa do afiliado: dados, vendas, clientes, comissões, contratos e documento. */
export function AffiliateFicha({ id, notify, onClose, onEdit, onChanged }: { id: string; notify: Notify; onClose: () => void; onEdit?: (userId: string) => void; onChanged?: () => void }) {
  const [data, setData] = useState<RecordValue | null>(null);
  const load = useCallback(async () => {
    try { setData(await fetchAdmin(`/api/v1/admin/afiliados/${id}/ficha`)); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível abrir a ficha.'); onClose(); }
  }, [id, notify, onClose]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <AdminDrawer size="page" title="Abrindo ficha…" onClose={onClose}><div className="admin-spinner" aria-label="Carregando" /></AdminDrawer>;
  const u = (data.usuario ?? {}) as RecordValue;
  const ind = (data.indicadores ?? {}) as RecordValue;
  const extra = (data.dadosContrato ?? {}) as RecordValue;
  const contracts = (data.contratos ?? []) as RecordValue[];
  const active = contracts.filter((item) => item.status !== 'cancelado');
  const signed = active.filter((item) => item.status === 'assinado').length;
  return <AdminDrawer size="page" title="Ficha do afiliado" subtitle={u.nome} onClose={onClose} actions={onEdit && u.id ? <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => onEdit(u.id)}>Editar conta</button> : undefined}>
    <div className="ficha">
      <FichaHead
        name={u.nome ?? 'Afiliado'}
        lines={[u.email, phoneText(u.telefone), u.cpf && `CPF ${u.cpf}`, u.cidade]}
        chips={<>
          <span className={statusClass(data.statusAprovacao)}>{statusLabel(data.statusAprovacao)}</span>
          <LevelBadge info={data.nivel} />
          <code className="pc-code">{data.codigoAfiliado}</code>
          <span className="status-chip status-info">{Number(data.comissaoPadraoPct ?? 0).toLocaleString('pt-BR')}% de comissão</span>
          {active.length > 0 && <span className={signed === active.length ? 'status-chip status-success' : 'status-chip status-warning'}>{signed === active.length ? 'Contratos assinados' : `${active.length - signed} a assinar`}</span>}
          {u.desativadoEm && <span className="status-chip status-danger">Acesso removido</span>}
        </>}
      />
      <FichaStats items={[
        { label: 'Clientes', value: ind.clientes ?? 0, hint: `${ind.compradores ?? 0} compraram` },
        { label: 'Total vendido', value: money(ind.vendido), hint: `${ind.cotas ?? 0} cotas`, tone: 'green' },
        { label: 'Ticket médio', value: money(ind.ticketMedio), hint: 'por cliente' },
        { label: 'Comissão a pagar', value: money(ind.pendente), tone: Number(ind.pendente) > 0 ? 'amber' : undefined },
        { label: 'Comissão paga', value: money(ind.paga) },
        { label: 'Última venda', value: ind.ultimaVenda ? dateOnly(ind.ultimaVenda) : '—' },
      ]} />
      <FichaGrid>
        <div className="ficha-col">
          <FichaSection title="Dados pessoais">
            <InfoList rows={[
              ['Nome completo', u.nome], ['CPF', u.cpf], ['Nascimento', u.dataNascimento ? dateOnly(String(u.dataNascimento).slice(0, 10) + 'T12:00:00Z') : null],
              ['RG', extra.rg ? `${extra.rg}${extra.rgOrgao ? ` ${extra.rgOrgao}` : ''}` : null], ['Nacionalidade', extra.nacionalidade], ['Estado civil', extra.estadoCivil], ['Profissão', extra.profissao],
              ['E-mail', u.email], ['Celular', phoneText(u.telefone)], ['Endereço', u.endereco],
            ]} />
          </FichaSection>
          <FichaSection title="Cadastro de afiliado">
            <InfoList rows={[
              ['Código', <code key="c">{data.codigoAfiliado}</code>], ['Comissão', `${Number(data.comissaoPadraoPct ?? 0).toLocaleString('pt-BR')}%`],
              ['Limite por bolão', data.nivel ? `${data.nivel.maxCotas} cotas · cota até ${money(data.nivel.maxValorCota)}` : null],
              ['Pix para repasse', data.chavePixRepasse ?? u.chavePix], ['Cadastro', dateOnly(data.criadoEm)], ['Aprovado em', data.aprovadoEm ? dateOnly(data.aprovadoEm) : null],
              ['Indicado por', data.indicadoPor ? `${data.indicadoPor.nome} (${data.indicadoPor.codigo})` : 'Direto'], ['Verificação', KYC_TEXT[u.statusKyc] ?? u.statusKyc],
            ]} />
          </FichaSection>
          <FichaSection title="Contratos">
            {contracts.length ? <ul className="ficha-list">{contracts.map((item) => {
              const [text, cls] = CONTRACT_STATUS[item.status] ?? [item.status, 'status-chip'];
              return <li key={item.id}>
                <div><strong>{item.tipo === 'afiliado' ? 'Contrato de afiliado' : 'Termo aditivo'}</strong><small>{item.numero} · {item.assinadoEm ? `assinado em ${dateTime(item.assinadoEm)}` : `gerado em ${dateOnly(item.criadoEm)}`}{item.empresaAssinadaEm ? ' · empresa assinou' : ' · falta a empresa'}</small></div>
                <div className="ficha-right"><span className={cls}>{text}</span><a className="admin-button admin-button-small admin-button-ghost" href={`/api/v1/admin/contratos/${item.id}/pdf?ver=1`} target="_blank" rel="noreferrer">PDF</a></div>
              </li>;
            })}</ul> : <FichaEmpty text={data.contratoAceitoEm ? `Aceite do contrato no cadastro em ${dateOnly(data.contratoAceitoEm)}. O contrato para assinar é gerado quando ele abre o app.` : 'Ainda sem contrato. Ele é gerado quando o afiliado abre o app.'} />}
            {contracts.length > 0 && data.contratoAceitoEm && <p className="admin-help" style={{ margin: '8px 0 0' }}>Aceite no cadastro em {dateOnly(data.contratoAceitoEm)}.</p>}
          </FichaSection>
          {data.documento && <FichaSection title="Documento de identidade">
            <IdentityReview affiliateId={data.id} doc={data.documento} notify={notify} onChanged={(next) => { setData({ ...data, documento: next }); onChanged?.(); }} />
          </FichaSection>}
        </div>
        <div className="ficha-col">
          <FichaSection title="Maiores clientes" action={<Link className="admin-link-button" href={`/admin?view=crm&afiliado=${data.id}`} onClick={onClose}>Ver todos</Link>}>
            {(data.maioresClientes ?? []).length ? <ul className="ficha-list">{(data.maioresClientes as RecordValue[]).map((row) => <li key={row.id}>
              <div><strong>{row.nome}</strong><small>{row.cotas} {row.cotas === 1 ? 'cota' : 'cotas'} · última {dateOnly(row.ultima)}</small></div>
              <div className="ficha-right"><strong>{money(row.valor)}</strong></div>
            </li>)}</ul> : <FichaEmpty text="Nenhuma venda paga ainda." />}
          </FichaSection>
          <FichaSection title="Últimas comissões" action={<Link className="admin-link-button" href="/admin?view=comissoes" onClick={onClose}>Extrato</Link>}>
            {(data.comissoes ?? []).length ? <ul className="ficha-list">{(data.comissoes as RecordValue[]).map((row) => {
              const [text, cls] = COMMISSION_STATUS[row.status] ?? [row.status, 'status-chip'];
              return <li key={row.id}>
                <div><strong>{row.cliente}</strong><small>{row.bolao ?? 'Bolão'} · {dateOnly(row.criadoEm)}{row.percentual ? ` · ${Number(row.percentual).toLocaleString('pt-BR')}%` : ''}</small></div>
                <div className="ficha-right"><strong>{money(row.valor)}</strong><span className={cls}>{text}</span></div>
              </li>;
            })}</ul> : <FichaEmpty text="Nenhuma comissão ainda." />}
          </FichaSection>
          <FichaSection title="Grupos">
            {(data.grupos ?? []).length ? <ul className="ficha-list">{(data.grupos as RecordValue[]).map((group) => <li key={group.id}><div><strong>{group.nome}</strong><small>/{group.slug}</small></div><div className="ficha-right"><small>{group.membros} {group.membros === 1 ? 'pessoa' : 'pessoas'}</small></div></li>)}</ul> : <FichaEmpty text="Nenhum grupo." />}
          </FichaSection>
          {(data.indicados ?? []).length > 0 && <FichaSection title="Afiliados que ele indicou">
            <ul className="ficha-list">{(data.indicados as RecordValue[]).map((item) => <li key={item.id}><div><strong>{item.nome}</strong><small>{item.codigo}</small></div><div className="ficha-right"><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></div></li>)}</ul>
          </FichaSection>}
        </div>
      </FichaGrid>
    </div>
  </AdminDrawer>;
}
