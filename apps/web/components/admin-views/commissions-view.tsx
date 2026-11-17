'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { modalityNames } from '../../lib/domain';
import { money, dateTime, dateOnly, statusLabel, statusClass, fetchAdmin, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx, RecordValue } from './shared';

/* Comissões por afiliado: uma linha por afiliado com o total a receber e o extrato de cada cota.
   Abas: A pagar (pendentes), Pagas e Canceladas. Filtros por afiliado, mês e período. */

type Tab = 'pendente' | 'paga' | 'cancelada';
const TABS: ReadonlyArray<readonly [Tab, string]> = [['pendente', 'A pagar'], ['paga', 'Pagas'], ['cancelada', 'Canceladas']];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const name = MONTHS[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

function poolLabel(bolao: RecordValue | null | undefined) {
  if (!bolao) return '—';
  const name = modalityNames[bolao.modalidade] ?? bolao.modalidade;
  return `${name} ${bolao.numeroConcurso > 0 ? `#${bolao.numeroConcurso}` : '(a definir)'}`;
}

function recentMonths(count = 13) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: monthLabel(key) };
  });
}

/** Baixa o extrato de um afiliado em planilha (CSV, abre no Excel). */
function downloadStatement(affiliate: RecordValue, tab: Tab) {
  const header = ['Data', 'Quem comprou', 'Bolão', 'Grupo', 'Base', '%', 'Comissão', 'Situação', 'Lote', 'Pago em'];
  const lines = (affiliate.itens as RecordValue[]).map((item) => [dateTime(item.criadoEm), item.comprador, poolLabel(item.bolao), item.grupo ?? '', String(item.baseCalculo ?? '').replace('.', ','), String(item.percentual ?? '').replace('.', ','), String(item.valor).replace('.', ','), statusLabel(item.status), item.lote?.codigo ?? '', item.pagoEm ? dateTime(item.pagoEm) : '']);
  const total = ['', '', '', '', '', 'Total', String(affiliate.total).replace('.', ','), '', '', ''];
  const csv = [header, ...lines, total].map((cells) => cells.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `extrato-comissoes-${tab === 'pendente' ? 'a-pagar' : tab === 'paga' ? 'pagas' : 'canceladas'}-${String(affiliate.codigo ?? affiliate.nome).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function CommissionsView({ ctx }: { ctx: AdminCtx }) {
  const { notify } = ctx;
  const [tab, setTab] = useState<Tab>('pendente');
  const [affiliateId, setAffiliateId] = useState('');
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dateBasis, setDateBasis] = useState<'venda' | 'pagamento'>('venda');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ status: tab });
      if (affiliateId) query.set('afiliadoId', affiliateId);
      if (month) query.set('mes', month);
      if (from) query.set('de', from);
      if (to) query.set('ate', to);
      if (tab === 'paga' && dateBasis === 'pagamento') query.set('data', 'pagamento');
      if (search.trim()) query.set('busca', search.trim());
      setData(await fetchAdmin(`/api/v1/admin/comissoes-afiliados?${query.toString()}`));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível carregar as comissões.');
    } finally {
      setLoading(false);
    }
  }, [tab, affiliateId, month, from, to, dateBasis, search, notify]);

  // A busca por texto só vai quando a pessoa aperta Enter ou "Atualizar"; os outros filtros já recarregam.
  useEffect(() => { void load(); }, [tab, affiliateId, month, from, to, dateBasis]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected([]); }, [tab, affiliateId, month, from, to, dateBasis]);

  const affiliates: RecordValue[] = data?.afiliados ?? [];
  const resumo: RecordValue = data?.resumo ?? {};
  const options: RecordValue[] = data?.opcoesAfiliados ?? [];
  const filtered = Boolean(affiliateId || month || from || to || search.trim());
  const selectedTotal = useMemo(() => affiliates.flatMap((affiliate) => affiliate.itens as RecordValue[]).filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + Number(item.valor), 0), [affiliates, selected]);

  const toggleOpen = (id: string) => setOpen((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleItem = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const clearFilters = () => { setAffiliateId(''); setMonth(''); setFrom(''); setTo(''); setSearch(''); setDateBasis('venda'); };

  async function createBatch(ids: string[], label: string) {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      const batch = await fetchAdmin('/api/v1/admin/repasses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoIds: ids }) });
      notify('success', `Lote ${batch?.codigo ?? ''} criado com ${ids.length} ${ids.length === 1 ? 'comissão' : 'comissões'} de ${label}. Depois de fazer o Pix, marque como pago em "Pagar comissões".`);
      setSelected([]);
      await load();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Não foi possível criar o lote.');
    } finally {
      setBusy(false);
    }
  }

  const freeLabel = (affiliate: RecordValue) => Number(affiliate.emLote) > 0 ? <small>{money(affiliate.livre)} livre · {money(affiliate.emLote)} já em lote</small> : null;

  return <>
    <SectionHeading title="Comissões" action={<Link href="/admin?view=repasses" className="admin-button admin-button-primary">Pagar comissões</Link>} />

    <nav className="pool-status-tabs report-tabs comm-tabs" aria-label="Situação das comissões">
      {TABS.map(([key, text]) => <button key={key} type="button" className={`report-tab ${tab === key ? 'is-current' : ''}`} aria-pressed={tab === key} onClick={() => { setTab(key); setOpen([]); }}>
        {text}<span className="comm-tab-total">{money(resumo[key]?.total ?? 0)}</span><span className="pool-tab-count">{resumo[key]?.quantidade ?? 0}</span>
      </button>)}
    </nav>

    <div className="comm-filters" role="search">
      <label><span>Afiliado</span><select value={affiliateId} onChange={(event) => setAffiliateId(event.target.value)}><option value="">Todos os afiliados</option>{options.map((option) => <option key={option.id} value={option.id}>{option.nome} ({option.codigo})</option>)}</select></label>
      <label><span>Mês</span><select value={month} onChange={(event) => setMonth(event.target.value)}><option value="">Todos os meses</option>{recentMonths().map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label><span>De</span><input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
      <label><span>Até</span><input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
      {tab === 'paga' && <label><span>Contar pela data</span><select value={dateBasis} onChange={(event) => setDateBasis(event.target.value === 'pagamento' ? 'pagamento' : 'venda')}><option value="venda">da venda</option><option value="pagamento">do pagamento</option></select></label>}
      <label className="comm-filter-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="Afiliado, código ou quem comprou" /></label>
      <div className="comm-filter-actions"><button type="button" className="admin-button admin-button-ghost" onClick={() => void load()}>Atualizar</button>{filtered && <button type="button" className="admin-button admin-button-ghost" onClick={clearFilters}>Limpar filtros</button>}</div>
    </div>

    <div className="comm-summary" aria-live="polite">
      <div><span>{tab === 'pendente' ? 'Total a pagar' : tab === 'paga' ? 'Total pago' : 'Total cancelado'}{filtered ? ' (no filtro)' : ''}</span><strong>{money(data?.total ?? 0)}</strong></div>
      <div><span>Comissões</span><strong>{data?.quantidade ?? 0}</strong></div>
      <div><span>Afiliados</span><strong>{affiliates.length}</strong></div>
      {tab === 'pendente' && selected.length > 0 && <div className="comm-summary-action"><span>{selected.length} selecionada{selected.length === 1 ? '' : 's'} · {money(selectedTotal)}</span><button type="button" className="admin-button admin-button-primary" disabled={busy} onClick={() => void createBatch(selected, 'itens selecionados')}>Criar lote com as selecionadas</button></div>}
    </div>

    <Panel title={tab === 'pendente' ? 'A pagar por afiliado' : tab === 'paga' ? 'Comissões pagas por afiliado' : 'Comissões canceladas por afiliado'} description={tab === 'pendente' ? 'Cada linha é um afiliado com o total que ele tem a receber. Abra o extrato para ver cada cota vendida.' : 'Cada linha é um afiliado com o total do filtro. Abra o extrato para ver cada cota e quando foi pago.'}>
      {loading ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div> : <>
        <Table minWidth={860}>
          <thead><tr><th>Afiliado</th><th>Comissões</th><th>{tab === 'pendente' ? 'Total a receber' : 'Total'}</th><th>Última venda</th><th>Ações</th></tr></thead>
          <tbody>{affiliates.map((affiliate) => {
            const isOpen = open.includes(affiliate.afiliadoId);
            const items = affiliate.itens as RecordValue[];
            const free = items.filter((item) => item.status === 'pendente' && !item.lote).map((item) => item.id as string);
            const allChecked = free.length > 0 && free.every((id) => selected.includes(id));
            return <Fragment key={affiliate.afiliadoId}>
              <tr className={`comm-row${isOpen ? ' is-open' : ''}`}>
                <td data-label="Afiliado"><strong>{affiliate.nome}</strong><small><code>{affiliate.codigo}</code>{affiliate.chavePix ? ` · Pix: ${affiliate.chavePix}` : ' · sem chave Pix'}</small></td>
                <td data-label="Comissões" className="td-nowrap">{affiliate.quantidade} {affiliate.quantidade === 1 ? 'cota' : 'cotas'}</td>
                <td data-label={tab === 'pendente' ? 'Total a receber' : 'Total'} className="td-nowrap"><strong className="comm-total">{money(affiliate.total)}</strong>{tab === 'pendente' && freeLabel(affiliate)}</td>
                <td data-label="Última venda" className="td-nowrap">{dateOnly(affiliate.ultimaData)}</td>
                <td data-label="Ações"><div className="admin-row-actions">
                  <button type="button" className="admin-button admin-button-small" aria-expanded={isOpen} onClick={() => toggleOpen(affiliate.afiliadoId)}>{isOpen ? 'Fechar extrato' : 'Ver extrato'}</button>
                  {tab === 'pendente' && free.length > 0 && <button type="button" className="admin-button admin-button-small admin-button-primary" disabled={busy} onClick={() => void createBatch(free, affiliate.nome)}>Separar para pagar ({money(affiliate.livre)})</button>}
                  <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => downloadStatement(affiliate, tab)}>Baixar planilha</button>
                </div></td>
              </tr>
              {isOpen && <tr className="comm-detail"><td colSpan={5}>
                <div className="comm-months" aria-label="Total por mês">{(affiliate.meses as RecordValue[]).map((item) => <button type="button" key={item.mes} className={`comm-month${month === item.mes ? ' is-current' : ''}`} title="Filtrar por este mês" onClick={() => setMonth(month === item.mes ? '' : item.mes)}><span>{monthLabel(item.mes)}</span><strong>{money(item.total)}</strong><small>{item.quantidade} {item.quantidade === 1 ? 'cota' : 'cotas'}</small></button>)}</div>
                <div className="admin-table-scroll comm-statement"><table className="admin-table" style={{ minWidth: 820 }}>
                  <thead><tr>{tab === 'pendente' && <th><input type="checkbox" aria-label={`Selecionar todas de ${affiliate.nome}`} checked={allChecked} disabled={!free.length} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...free])] : current.filter((id) => !free.includes(id)))} /></th>}<th>Data da venda</th><th>Quem comprou</th><th>Bolão</th><th>Base</th><th>%</th><th>Comissão</th><th>{tab === 'paga' ? 'Pago em' : 'Situação'}</th></tr></thead>
                  <tbody>{items.map((item) => <tr key={item.id}>
                    {tab === 'pendente' && <td data-label="Selecionar"><input type="checkbox" checked={selected.includes(item.id)} disabled={Boolean(item.lote)} onChange={() => toggleItem(item.id)} aria-label={`Selecionar comissão da cota ${String(item.cotaId).slice(0, 8)}`} /></td>}
                    <td data-label="Data da venda" className="td-nowrap">{dateTime(item.criadoEm)}</td>
                    <td data-label="Quem comprou">{item.comprador}<small>cota {String(item.cotaId).slice(0, 8)}</small></td>
                    <td data-label="Bolão">{poolLabel(item.bolao)}{item.bolao?.valorCota !== undefined && <span className="pool-price-tag">{money(item.bolao.valorCota)} <span>/ cota</span></span>}{item.grupo && <small>{item.grupo}</small>}</td>
                    <td data-label="Base" className="td-nowrap">{money(item.baseCalculo)}</td>
                    <td data-label="%" className="td-nowrap">{item.percentual ?? '—'}%</td>
                    <td data-label="Comissão" className="td-nowrap"><strong>{money(item.valor)}</strong></td>
                    <td data-label={tab === 'paga' ? 'Pago em' : 'Situação'} className="td-nowrap">{tab === 'paga' ? <>{dateTime(item.pagoEm)}{item.lote?.codigo && <small>lote {item.lote.codigo}</small>}</> : item.lote ? <><span className="status-chip status-warning">No lote {item.lote.codigo}</span><small>aguardando pagamento</small></> : <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>}</td>
                  </tr>)}</tbody>
                  <tfoot><tr><td colSpan={tab === 'pendente' ? 6 : 5}>Total de {affiliate.nome}</td><td className="td-nowrap"><strong>{money(affiliate.total)}</strong></td><td /></tr></tfoot>
                </table></div>
              </td></tr>}
            </Fragment>;
          })}</tbody>
        </Table>
        {!affiliates.length && <Empty title={tab === 'pendente' ? 'Nenhuma comissão a pagar' : tab === 'paga' ? 'Nenhuma comissão paga' : 'Nenhuma comissão cancelada'} description={filtered ? 'Nada encontrado com esses filtros.' : undefined} />}
        {data?.limitado && <p className="comm-note">Mostrando as 10.000 comissões mais recentes. Use os filtros de mês ou período para ver o restante.</p>}
      </>}
    </Panel>
  </>;
}
