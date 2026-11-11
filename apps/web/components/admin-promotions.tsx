'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, chip, dateTime, Kpi, Notify, Panel, Rec, Table, Empty } from './admin-ui';

const cents = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0) / 100);
const toNumber = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'));
const optionalNumber = (value: string) => (value.trim() === '' ? null : toNumber(value));
const toIso = (value: string) => (value ? new Date(value).toISOString() : null);

type Picked = { id: string; nome: string; email?: string };

/** Escolha de quem recebe: grupos e clientes. */
function AudiencePicker({ label, groups, pickedGroups, setPickedGroups, pickedClients, setPickedClients }: { label: string; groups: Rec[]; pickedGroups: string[]; setPickedGroups: (ids: string[]) => void; pickedClients: Picked[]; setPickedClients: (items: Picked[]) => void }) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<Rec[]>([]);
  useEffect(() => {
    if (term.trim().length < 2) { setFound([]); return; }
    const timer = window.setTimeout(() => { void api(`/api/v1/admin/promocoes/clientes?busca=${encodeURIComponent(term.trim())}`).then((result) => setFound(result.items ?? [])).catch(() => setFound([])); }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);
  return <div className="admin-field admin-field-wide"><span>{label}</span>
    <div className="admin-chip-row" aria-label="Grupos">{groups.length === 0 && <small>Nenhum grupo criado ainda.</small>}{groups.map((group) => <label key={group.id} className="check-line"><input type="checkbox" checked={pickedGroups.includes(group.id)} onChange={(event) => setPickedGroups(event.target.checked ? [...pickedGroups, group.id] : pickedGroups.filter((id) => id !== group.id))} /><span>{group.nome} <small>({group.membros} {group.membros === 1 ? 'membro' : 'membros'})</small></span></label>)}</div>
    <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar cliente por nome ou e-mail" aria-label="Buscar cliente" />
    {found.length > 0 && <ul className="admin-pick-list">{found.filter((item) => !pickedClients.some((client) => client.id === item.id)).map((item) => <li key={item.id}><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => { setPickedClients([...pickedClients, { id: item.id, nome: item.nome, email: item.email }]); setTerm(''); setFound([]); }}>+ {item.nome} · {item.email}</button></li>)}</ul>}
    {pickedClients.length > 0 && <div className="admin-chip-row" aria-label="Clientes escolhidos">{pickedClients.map((client) => <button key={client.id} type="button" className="admin-chip" title="Tirar da lista" onClick={() => setPickedClients(pickedClients.filter((item) => item.id !== client.id))}>{client.nome} ✕</button>)}</div>}
  </div>;
}

const audienceText = (row: Rec) => [...(row.grupos ?? []).map((group: Rec) => `Grupo ${group.nome}`), ...(row.clientes ?? []).map((client: Rec) => client.nome)].join(', ');
const levelText = (row: Rec) => [row.gastoMinimoCentavos ? `gastou ${cents(row.gastoMinimoCentavos)} ou mais` : '', row.comprasMinimas ? `${row.comprasMinimas}+ ${row.comprasMinimas === 1 ? 'compra' : 'compras'}` : ''].filter(Boolean).join(' e ');
const siteUrl = () => (typeof window === 'undefined' ? '' : window.location.origin);

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Cupons de desconto e campanhas de cashback. Só o administrador vê esta tela. */
export function PromotionsAdminView({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<'cupons' | 'cashback'>('cupons');
  const [coupons, setCoupons] = useState<Rec[]>([]);
  const [campaigns, setCampaigns] = useState<Rec[]>([]);
  const [groups, setGroups] = useState<Rec[]>([]);
  const [busy, setBusy] = useState(false);
  const [uses, setUses] = useState<{ codigo: string; items: Rec[] } | null>(null);
  // Cupom
  const [code, setCode] = useState(''); const [description, setDescription] = useState(''); const [kind, setKind] = useState<'percentual' | 'valor'>('percentual'); const [value, setValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState(''); const [minPurchase, setMinPurchase] = useState(''); const [startAt, setStartAt] = useState(''); const [endAt, setEndAt] = useState('');
  const [limitTotal, setLimitTotal] = useState(''); const [limitClient, setLimitClient] = useState('1');
  // Cashback
  const [cName, setCName] = useState(''); const [cPct, setCPct] = useState(''); const [cMin, setCMin] = useState(''); const [cMax, setCMax] = useState(''); const [cBudget, setCBudget] = useState(''); const [cStart, setCStart] = useState(''); const [cEnd, setCEnd] = useState(''); const [cActive, setCActive] = useState(false);
  const [cSpent, setCSpent] = useState(''); const [cPurchases, setCPurchases] = useState('');
  const [cGroups, setCGroups] = useState<string[]>([]); const [cClients, setCClients] = useState<Picked[]>([]);

  const load = useCallback(async () => {
    try {
      const [couponResult, campaignResult, groupResult] = await Promise.all([api('/api/v1/admin/cupons'), api('/api/v1/admin/cashback-campanhas'), api('/api/v1/admin/promocoes/grupos')]);
      setCoupons(couponResult.items ?? []); setCampaigns(campaignResult.items ?? []); setGroups(groupResult.items ?? []);
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível abrir cupons e cashback.'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try { notify('success', await action()); await load(); } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível concluir.'); } finally { setBusy(false); }
  }
  const post = (path: string, method: string, body?: unknown) => api(path, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });

  function createCoupon(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const number = toNumber(value);
      if (!Number.isFinite(number) || number <= 0) throw new Error('Informe o valor do desconto.');
      if (kind === 'percentual' && number > 100) throw new Error('A porcentagem não pode passar de 100.');
      const result = await post('/api/v1/admin/cupons', 'POST', {
        ...(code.trim() ? { codigo: code.trim() } : {}), descricao: description.trim() || undefined, tipo: kind, valor: number,
        descontoMaximoReais: optionalNumber(maxDiscount), valorMinimoReais: optionalNumber(minPurchase), automatico: false, inicioEm: toIso(startAt), fimEm: toIso(endAt),
        limiteTotal: limitTotal.trim() ? Math.trunc(Number(limitTotal)) : null, limitePorCliente: limitClient.trim() ? Math.trunc(Number(limitClient)) : null,
      });
      const free = kind === 'percentual' && number >= 100;
      setCode(''); setDescription(''); setValue(''); setMaxDiscount(''); setMinPurchase(''); setStartAt(''); setEndAt(''); setLimitTotal(''); setLimitClient('1');
      return free && !limitTotal.trim() ? `Cupom ${result.codigo} criado. Atenção: sem limite total de usos, quem tiver o código pode usar até o limite por cliente.` : `Cupom ${result.codigo} criado. Quem receber o código já pode usar.`;
    });
  }

  function createCampaign(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const pct = toNumber(cPct);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Error('Informe o percentual de cashback (de 0,01 a 100).');
      const spent = optionalNumber(cSpent); const purchases = cPurchases.trim() ? Math.trunc(Number(cPurchases)) : null;
      if (!cGroups.length && !cClients.length && !(spent && spent > 0) && !(purchases && purchases > 0)) throw new Error('Escolha para quem vale: um grupo, clientes específicos ou um nível de compra/gasto.');
      await post('/api/v1/admin/cashback-campanhas', 'POST', { nome: cName.trim(), percentual: pct, valorMinimoReais: optionalNumber(cMin), maximoPorCompraReais: optionalNumber(cMax), orcamentoReais: optionalNumber(cBudget), gastoMinimoReais: spent && spent > 0 ? spent : null, comprasMinimas: purchases && purchases > 0 ? purchases : null, inicioEm: toIso(cStart), fimEm: toIso(cEnd), ativa: cActive, grupoIds: cGroups, usuarioIds: cClients.map((client) => client.id) });
      const message = cActive ? 'Campanha criada e ativada.' : 'Campanha criada e pausada. Ative quando quiser começar.';
      setCName(''); setCPct(''); setCMin(''); setCMax(''); setCBudget(''); setCStart(''); setCEnd(''); setCActive(false); setCSpent(''); setCPurchases(''); setCGroups([]); setCClients([]);
      return message;
    });
  }

  async function showUses(coupon: Rec) {
    try { const result = await api(`/api/v1/admin/cupons/${coupon.id}/usos`); setUses({ codigo: coupon.codigo, items: result.items ?? [] }); } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível abrir os usos.'); }
  }

  const activeCoupons = coupons.filter((coupon) => coupon.estado === 'ativo').length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.estado === 'ativa').length;
  const stateChip = (state: string) => <span className={chip(state === 'ativo' || state === 'ativa' ? 'aberto' : state === 'pausado' || state === 'pausada' ? 'pendente' : 'cancelada')}>{state}</span>;

  return <>
    <div className="admin-page-heading"><div><h1>Cupons e cashback</h1></div></div>
    <div className="admin-kpi-grid">
      <Kpi label="Cupons ativos" value={activeCoupons} tone="green" />
      <Kpi label="Desconto já dado (pagos)" value={cents(coupons.reduce((sum, coupon) => sum + Number(coupon.descontoTotalCentavos ?? 0), 0))} tone="violet" />
      <Kpi label="Campanhas de cashback ativas" value={activeCampaigns} tone="green" />
      <Kpi label="Cashback já creditado" value={cents(campaigns.reduce((sum, campaign) => sum + Number(campaign.creditadoCentavos ?? 0), 0))} tone="violet" />
    </div>
    <div className="notice"><strong>Como funciona</strong><span>Cupom e cashback são coisas separadas. <b>Cupom:</b> qualquer pessoa que receber o código tem o desconto que você definiu, até 100% (cota grátis, confirmada na hora). <b>Cashback:</b> você escolhe quem recebe — grupos, cotistas específicos ou clientes por nível de compra e gasto — e o valor cai na carteira depois do pagamento. Descontos acima da taxa do BL saem do caixa do BL (aparecem como “custo para o BL”).</span></div>
    <div className="admin-tabs" role="tablist"><button role="tab" aria-selected={tab === 'cupons'} className={`admin-button admin-button-small ${tab === 'cupons' ? 'admin-button-primary' : 'admin-button-ghost'}`} onClick={() => setTab('cupons')}>Cupons de desconto</button><button role="tab" aria-selected={tab === 'cashback'} className={`admin-button admin-button-small ${tab === 'cashback' ? 'admin-button-primary' : 'admin-button-ghost'}`} onClick={() => setTab('cashback')}>Cashback por campanha</button></div>

    {tab === 'cupons' && <>
      <Panel title="Criar cupom" description="Vale para qualquer pessoa que tiver o código. Você envia o código (ou o link) para quem quiser.">
        <form className="admin-form-grid" onSubmit={createCoupon} aria-label="Criar cupom">
          <label className="admin-field"><span>Código (deixe vazio para gerar)</span><input value={code} maxLength={40} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Ex.: COTISTA10" /></label>
          <label className="admin-field"><span>Descrição (opcional)</span><input value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="admin-field"><span>Tipo de desconto</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="percentual">Porcentagem do valor pago (%)</option><option value="valor">Valor fixo (R$)</option></select></label>
          <label className="admin-field"><span>{kind === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}</span><input inputMode="decimal" required value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === 'percentual' ? '10' : '5,00'} /></label>
          <label className="admin-field"><span>Desconto máximo por compra (R$, opcional)</span><input inputMode="decimal" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} /></label>
          <label className="admin-field"><span>Compra mínima (R$, opcional)</span><input inputMode="decimal" value={minPurchase} onChange={(event) => setMinPurchase(event.target.value)} /></label>
          <label className="admin-field"><span>Começa em (opcional)</span><input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
          <label className="admin-field"><span>Termina em (opcional)</span><input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label>
          <label className="admin-field"><span>Limite total de usos (opcional)</span><input inputMode="numeric" value={limitTotal} onChange={(event) => setLimitTotal(event.target.value.replace(/\D/g, ''))} /></label>
          <label className="admin-field"><span>Usos por cliente</span><input inputMode="numeric" value={limitClient} onChange={(event) => setLimitClient(event.target.value.replace(/\D/g, ''))} /></label>
          {kind === 'percentual' && Number(value.replace(',', '.')) >= 100 && <div className="notice admin-field-wide"><strong>Cota grátis</strong><span>Com esse desconto a cota sai por R$ 0,00 e é confirmada na hora, sem pagamento. Defina o limite total de usos para controlar quantas cotas grátis podem sair.</span></div>}
          <button className="admin-button admin-button-primary" disabled={busy}>Criar cupom</button>
        </form>
      </Panel>
      <Panel title="Cupons criados">
        <Table minWidth={1000}><thead><tr><th>Código</th><th>Desconto</th><th>Quem recebe</th><th>Usos</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id}>
          <td><strong>{coupon.codigo}</strong><small>{coupon.descricao ?? ''}{coupon.automatico ? ' · automático' : ''}</small></td>
          <td>{coupon.resumo}<small>{coupon.descontoMaximoCentavos ? `até ${cents(coupon.descontoMaximoCentavos)}` : ''}{coupon.valorMinimoCentavos ? ` · mín. ${cents(coupon.valorMinimoCentavos)}` : ''}</small></td>
          <td>{audienceText(coupon) || 'Qualquer pessoa com o código'}{coupon.automatico ? <small>aplicado sozinho</small> : null}</td>
          <td>{coupon.usosPagos} pagos · {coupon.usosEmAberto} em aberto{coupon.limiteTotal ? ` / limite ${coupon.limiteTotal}` : ''}<small>Desconto dado: {cents(coupon.descontoTotalCentavos)}{coupon.subsidioTotalCentavos ? ` · custo para o BL: ${cents(coupon.subsidioTotalCentavos)}` : ''}</small></td>
          <td>{stateChip(coupon.estado)}<small>{coupon.fimEm ? `até ${dateTime(coupon.fimEm)}` : ''}</small></td>
          <td className="admin-row-actions">
            <button className="admin-button admin-button-small admin-button-ghost" onClick={() => void copyText(coupon.codigo).then((ok) => notify(ok ? 'success' : 'error', ok ? `Código ${coupon.codigo} copiado.` : 'Não foi possível copiar. Selecione o código e copie.'))}>Copiar código</button>
            <button className="admin-button admin-button-small admin-button-ghost" onClick={() => void copyText(`${siteUrl()}/?cupom=${encodeURIComponent(coupon.codigo)}`).then((ok) => notify(ok ? 'success' : 'error', ok ? 'Link com o cupom copiado.' : 'Não foi possível copiar o link.'))}>Copiar link</button>
            <button className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => void showUses(coupon)}>Usos</button>
            {coupon.ativo ? <button className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => void run(async () => { await post(`/api/v1/admin/cupons/${coupon.id}/pausar`, 'POST'); return `Cupom ${coupon.codigo} pausado.`; })}>Pausar</button>
              : <button className="admin-button admin-button-small admin-button-primary" disabled={busy} onClick={() => void run(async () => { await post(`/api/v1/admin/cupons/${coupon.id}/ativar`, 'POST'); return `Cupom ${coupon.codigo} ativado.`; })}>Ativar</button>}
            {coupon.usosPagos + coupon.usosEmAberto === 0 && <button className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => { if (window.confirm(`Apagar o cupom ${coupon.codigo}?`)) void run(async () => { await post(`/api/v1/admin/cupons/${coupon.id}`, 'DELETE'); return 'Cupom apagado.'; }); }}>Apagar</button>}
          </td></tr>)}</tbody></Table>
        {!coupons.length && <Empty text="Nenhum cupom criado ainda" hint="Crie o primeiro acima e envie o código para quem quiser." />}
      </Panel>
      {uses && <Panel title={`Usos do cupom ${uses.codigo}`} action={<button className="admin-button admin-button-small admin-button-ghost" onClick={() => setUses(null)}>Fechar</button>}>
        <Table minWidth={720}><thead><tr><th>Quando</th><th>Cliente</th><th>Bolão</th><th>Cotas</th><th>Desconto</th><th>Situação</th></tr></thead><tbody>{uses.items.map((row) => <tr key={row.id}><td>{dateTime(row.em)}</td><td><strong>{row.cliente}</strong><small>{row.email}</small></td><td>{row.bolao}</td><td>{row.cotas}</td><td>{cents(row.descontoCentavos)}</td><td>{row.situacao}</td></tr>)}</tbody></Table>
        {!uses.items.length && <Empty text="Ainda não foi usado" />}
      </Panel>}
    </>}

    {tab === 'cashback' && <>
      <Panel title="Criar campanha de cashback" description="O cashback cai na carteira do cliente depois que o pagamento é confirmado. Se o pagamento for estornado, o cashback é desfeito.">
        <form className="admin-form-grid" onSubmit={createCampaign} aria-label="Criar campanha de cashback">
          <label className="admin-field"><span>Nome da campanha</span><input required minLength={3} maxLength={120} value={cName} onChange={(event) => setCName(event.target.value)} placeholder="Ex.: Cashback cotistas de novembro" /></label>
          <label className="admin-field"><span>Cashback (% do valor pago)</span><input inputMode="decimal" required value={cPct} onChange={(event) => setCPct(event.target.value)} placeholder="5" /></label>
          <label className="admin-field"><span>Compra mínima (R$, opcional)</span><input inputMode="decimal" value={cMin} onChange={(event) => setCMin(event.target.value)} /></label>
          <label className="admin-field"><span>Máximo por compra (R$, opcional)</span><input inputMode="decimal" value={cMax} onChange={(event) => setCMax(event.target.value)} /></label>
          <label className="admin-field"><span>Orçamento total da campanha (R$, opcional)</span><input inputMode="decimal" value={cBudget} onChange={(event) => setCBudget(event.target.value)} /></label>
          <label className="admin-field"><span>Começa em (opcional)</span><input type="datetime-local" value={cStart} onChange={(event) => setCStart(event.target.value)} /></label>
          <label className="admin-field"><span>Termina em (opcional)</span><input type="datetime-local" value={cEnd} onChange={(event) => setCEnd(event.target.value)} /></label>
          <label className="check-line admin-field-wide"><input type="checkbox" checked={cActive} onChange={(event) => setCActive(event.target.checked)} /><span>Ativar agora (se não marcar, a campanha fica pausada até você ativar)</span></label>
          <AudiencePicker label="Quem recebe: grupos e/ou clientes escolhidos" groups={groups} pickedGroups={cGroups} setPickedGroups={setCGroups} pickedClients={cClients} setPickedClients={setCClients} />
          <div className="admin-field admin-field-wide"><span>Ou por nível do cliente (opcional — vale para quem já atingiu o nível, somando com os grupos e clientes acima)</span>
            <div className="admin-form-grid">
              <label className="admin-field"><span>Já gastou pelo menos (R$)</span><input inputMode="decimal" value={cSpent} onChange={(event) => setCSpent(event.target.value)} placeholder="Ex.: 200" /></label>
              <label className="admin-field"><span>Já fez pelo menos (compras)</span><input inputMode="numeric" value={cPurchases} onChange={(event) => setCPurchases(event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 5" /></label>
            </div>
            <small>Se preencher os dois, o cliente precisa atingir os dois. Conta só compras confirmadas.</small></div>
          <button className="admin-button admin-button-primary" disabled={busy}>Criar campanha</button>
        </form>
      </Panel>
      <Panel title="Campanhas">
        <Table minWidth={1000}><thead><tr><th>Campanha</th><th>Cashback</th><th>Quem recebe</th><th>Creditado</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}>
          <td><strong>{campaign.nome}</strong></td>
          <td>{String(campaign.percentual).replace('.', ',')}%<small>{campaign.maximoPorCompraCentavos ? `até ${cents(campaign.maximoPorCompraCentavos)} por compra` : ''}{campaign.valorMinimoCentavos ? ` · mín. ${cents(campaign.valorMinimoCentavos)}` : ''}</small></td>
          <td>{[audienceText(campaign), levelText(campaign) ? `Nível: ${levelText(campaign)}` : ''].filter(Boolean).join(' · ') || '—'}</td>
          <td>{cents(campaign.creditadoCentavos)} em {campaign.compras} {campaign.compras === 1 ? 'compra' : 'compras'}<small>{campaign.restanteCentavos === null ? 'sem teto de orçamento' : `restam ${cents(campaign.restanteCentavos)}`}</small></td>
          <td>{stateChip(campaign.estado)}<small>{campaign.fimEm ? `até ${dateTime(campaign.fimEm)}` : ''}</small></td>
          <td className="admin-row-actions">
            {campaign.ativa ? <button className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => void run(async () => { await post(`/api/v1/admin/cashback-campanhas/${campaign.id}/pausar`, 'POST'); return 'Campanha pausada.'; })}>Pausar</button>
              : <button className="admin-button admin-button-small admin-button-primary" disabled={busy} onClick={() => void run(async () => { await post(`/api/v1/admin/cashback-campanhas/${campaign.id}/ativar`, 'POST'); return 'Campanha ativada.'; })}>Ativar</button>}
            {campaign.compras === 0 && <button className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => { if (window.confirm(`Apagar a campanha ${campaign.nome}?`)) void run(async () => { await post(`/api/v1/admin/cashback-campanhas/${campaign.id}`, 'DELETE'); return 'Campanha apagada.'; }); }}>Apagar</button>}
          </td></tr>)}</tbody></Table>
        {!campaigns.length && <Empty text="Nenhuma campanha criada ainda" hint="As campanhas começam pausadas, a menos que você marque para ativar na criação." />}
      </Panel>
    </>}
  </>;
}
