'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Limit = { maxCotas: number; maxValorCota: number };
type Level = 'bronze' | 'prata' | 'ouro' | 'diamante';
export type AffiliateLevelInfo = { nivel: Level; nomeNivel: string; manual: Limit | null; maxCotas: number; maxValorCota: number; origem: 'nivel' | 'manual' };
type Rules = { niveis: Record<Level, Limit>; requisitos?: Record<Level, string>; comissaoMaxPct: number; comissaoTravada: boolean; nomes: Record<Level, string> };

export const LEVEL_ORDER: Level[] = ['bronze', 'prata', 'ouro', 'diamante'];
export const LEVEL_LABEL: Record<Level, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante' };
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(' ') : data?.message ?? 'Não foi possível salvar.');
  return data;
}

/** Selo do nível do afiliado na lista do painel. */
export function LevelBadge({ info }: { info?: AffiliateLevelInfo | null }) {
  if (!info) return null;
  return <span className={`level-badge level-${info.nivel}`} title={`Até ${info.maxCotas} cotas por bolão e cota de até ${brl(info.maxValorCota)}`}>{info.origem === 'manual' ? `${info.nomeNivel} · limite manual` : info.nomeNivel}</span>;
}

/** Botão "Nível" do afiliado: escolhe Bronze/Prata/Ouro/Diamante e, se quiser, autoriza um limite manual. */
export function AffiliateLevelButton({ affiliateId, name, info, onSaved }: { affiliateId: string; name: string; info?: AffiliateLevelInfo | null; onSaved: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<Rules | null>(null);
  const [level, setLevel] = useState<Level>(info?.nivel ?? 'bronze');
  const [manual, setManual] = useState(Boolean(info?.manual));
  const [cotas, setCotas] = useState(String(info?.manual?.maxCotas ?? ''));
  const [valor, setValor] = useState(String(info?.manual?.maxValorCota ?? ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  function start() {
    setLevel(info?.nivel ?? 'bronze'); setManual(Boolean(info?.manual)); setCotas(String(info?.manual?.maxCotas ?? '')); setValor(String(info?.manual?.maxValorCota ?? '')); setError('');
    setOpen(true);
    if (!rules) api('/api/v1/admin/afiliados-regras').then(setRules).catch(() => undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const manualLimit = manual ? { maxCotas: Math.trunc(Number(cotas)), maxValorCota: Number(String(valor).replace(',', '.')) } : null;
    if (manualLimit && (!(manualLimit.maxCotas >= 1) || !(manualLimit.maxValorCota > 0))) { setError('Preencha o máximo de cotas e o valor máximo da cota.'); return; }
    setBusy(true);
    try {
      await api(`/api/v1/admin/afiliados/${affiliateId}/nivel`, { method: 'PUT', body: JSON.stringify({ nivel: level, manual: manualLimit }) });
      setOpen(false);
      onSaved(`Nível de ${name} atualizado.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  return <>
    <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={start}>Nível</button>
    {open && <dialog ref={dialog} className="admin-dialog level-dialog" onClose={() => setOpen(false)} aria-labelledby={`nivel-${affiliateId}`}>
      <form className="level-form" onSubmit={submit}>
        <header><h3 id={`nivel-${affiliateId}`}>Nível de {name}</h3><button type="button" className="numbers-dialog-close" aria-label="Fechar" onClick={() => setOpen(false)}>×</button></header>
        <p className="muted">O nível define até quantas cotas cada bolão do afiliado pode ter e o valor máximo da cota.</p>
        <div className="level-options" role="radiogroup" aria-label="Nível">
          {LEVEL_ORDER.map((key) => { const limit = rules?.niveis[key]; return <label key={key} className={`level-option level-${key}${level === key ? ' is-selected' : ''}`}>
            <input type="radio" name={`nivel-${affiliateId}`} value={key} checked={level === key} onChange={() => setLevel(key)} />
            <strong>{LEVEL_LABEL[key]}</strong>
            <small>{limit ? `até ${limit.maxCotas} cotas · cota até ${brl(limit.maxValorCota)}` : '…'}</small>
          </label>; })}
        </div>
        <label className="field-check level-manual-check"><input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} /> <span>Autorizar limite manual para este afiliado (vale no lugar do nível)</span></label>
        {manual && <div className="level-manual-grid">
          <label className="admin-field"><span>Máximo de cotas por bolão</span><input type="number" min="1" step="1" inputMode="numeric" value={cotas} onChange={(event) => setCotas(event.target.value)} required /></label>
          <label className="admin-field"><span>Valor máximo da cota (R$)</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={valor} onChange={(event) => setValor(event.target.value)} required /></label>
        </div>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <footer><button type="button" className="admin-button admin-button-ghost" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="admin-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nível'}</button></footer>
      </form>
    </dialog>}
  </>;
}

/** Configurações (conta principal): limites de cada nível e a trava da comissão máxima dos afiliados. */
export function AffiliateRulesPanel() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [draft, setDraft] = useState<Record<Level, { maxCotas: string; maxValorCota: string; requisitos: string }> | null>(null);
  const [pct, setPct] = useState('35');
  const [locked, setLocked] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function fill(data: Rules) {
    setRules(data);
    setDraft(Object.fromEntries(LEVEL_ORDER.map((key) => [key, { maxCotas: String(data.niveis[key].maxCotas), maxValorCota: String(data.niveis[key].maxValorCota), requisitos: data.requisitos?.[key] ?? '' }])) as Record<Level, { maxCotas: string; maxValorCota: string; requisitos: string }>);
    setPct(String(data.comissaoMaxPct)); setLocked(data.comissaoTravada);
  }
  useEffect(() => { api('/api/v1/admin/afiliados-regras').then(fill).catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível carregar.' })); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setMessage(null);
    try {
      const body = { niveis: Object.fromEntries(LEVEL_ORDER.map((key) => [key, { maxCotas: Math.trunc(Number(draft[key].maxCotas)), maxValorCota: Number(String(draft[key].maxValorCota).replace(',', '.')) }])), requisitos: Object.fromEntries(LEVEL_ORDER.map((key) => [key, draft[key].requisitos])), comissaoMaxPct: Number(String(pct).replace(',', '.')), comissaoTravada: locked };
      fill(await api('/api/v1/admin/afiliados-regras', { method: 'PUT', body: JSON.stringify(body) }));
      setMessage({ ok: true, text: 'Regras dos afiliados salvas.' });
    } catch (err) { setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível salvar.' }); } finally { setBusy(false); }
  }

  return <section className="admin-panel affiliate-rules-panel" aria-labelledby="regras-afiliados">
    <div className="admin-panel-header"><div><h2 id="regras-afiliados">Regras dos afiliados</h2><p className="muted">Limites para o afiliado criar bolão em cada nível e a comissão máxima. Todo afiliado começa no Bronze e sobe quando você muda o nível dele em Afiliados &gt; Nível.</p></div></div>
    {!rules || !draft ? <p className="muted">{message?.text ?? 'Carregando…'}</p> : <form onSubmit={submit} className="affiliate-rules-form">
      <div className="level-rules-grid">{LEVEL_ORDER.map((key) => <fieldset key={key} className={`level-rule level-${key}`}>
        <legend>{LEVEL_LABEL[key]}</legend>
        <label className="admin-field"><span>Até quantas cotas</span><input type="number" min="1" step="1" value={draft[key].maxCotas} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], maxCotas: event.target.value } })} required /></label>
        <label className="admin-field"><span>Cota de até (R$)</span><input type="number" min="0.01" step="0.01" value={draft[key].maxValorCota} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], maxValorCota: event.target.value } })} required /></label>
        <label className="admin-field"><span>Pré-requisitos para chegar aqui</span><textarea rows={2} maxLength={600} placeholder={key === 'bronze' ? 'Nível inicial' : 'Preencher depois'} value={draft[key].requisitos} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], requisitos: event.target.value } })} /></label>
      </fieldset>)}</div>
      <div className="commission-lock">
        <label className="field-check"><input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} /> <span><strong>Travar a comissão dos afiliados</strong> — ninguém consegue definir comissão acima do teto.</span></label>
        <label className="admin-field"><span>Comissão máxima (%)</span><input type="number" min="0" max="100" step="0.01" value={pct} onChange={(event) => setPct(event.target.value)} disabled={!locked} required /></label>
        <small className="muted">{locked ? `Hoje: comissão de no máximo ${Number(pct || 0).toLocaleString('pt-BR')}%.` : 'Destravada: a comissão pode ir até 100%. Marque de novo para travar.'}</small>
      </div>
      {message && <p className={`form-message ${message.ok ? 'form-success' : 'form-error'}`} role="status">{message.text}</p>}
      <div><button type="submit" className="admin-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar regras'}</button></div>
    </form>}
  </section>;
}
