'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, dateTime, Empty, modalityNames, Notify, Panel, Rec } from './admin-ui';

type Rule = { modalidade: string; min: number; max: number; limit: number };
const STRATEGIES: Array<[string, string]> = [['equilibrado', 'Equilibrado (evita padrões comuns)'], ['aleatorio', 'Totalmente aleatório'], ['quentes', 'Mais sorteados recentes'], ['atrasados', 'Mais atrasados'], ['misto', 'Misto (quentes e atrasados)']];
const ORIGIN: Record<string, string> = { ia: 'Gerado', manual: 'Digitado', bolao: 'De um bolão' };
const pad = (n: number) => String(n).padStart(2, '0');
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const jsonHeaders = { 'content-type': 'application/json' };

function Balls({ numbers }: { numbers: number[] }) {
  return <span className="bank-balls">{numbers.map((n) => <i key={n}>{pad(n)}</i>)}</span>;
}

function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    api<Rule[]>('/api/v1/admin/numeros/regras').then(setRules).catch(() => undefined);
    fetch('/api/v1/loterias/precos').then(async (response) => {
      const rows = response.ok ? await response.json() as Array<{ modalidade: string; chave: string; valorCentavos: number }> : [];
      setPrices(Object.fromEntries(rows.map((row) => [`${row.modalidade}:${row.chave}`, row.valorCentavos])));
    }).catch(() => undefined);
  }, []);
  return { rules, prices };
}

/** Banco de números: gerar, digitar e guardar jogos para reaproveitar nos bolões e, depois, cruzar com os resultados. */
export function NumbersBank({ notify }: { notify: Notify }) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const { rules, prices } = useRules();
  const [list, setList] = useState<Rec[]>([]);
  const [summary, setSummary] = useState<{ total: number; porModalidade: Record<string, number> }>({ total: 0, porModalidade: {} });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState({ modalidade: '', origem: '', dezenas: '', busca: '', semUso: false });
  const [loading, setLoading] = useState(true);

  const [gen, setGen] = useState({ modalidade: 'megasena', quantidade: '10', dezenas: '6', estrategia: 'equilibrado', fixos: '', excluir: '', rotulo: '', salvar: true });
  const [genBusy, setGenBusy] = useState(false);
  const [genOut, setGenOut] = useState<Rec | null>(null);
  const [manual, setManual] = useState({ modalidade: 'megasena', jogos: '', rotulo: '' });
  const [manualBusy, setManualBusy] = useState(false);

  const rule = (key: string) => rules.find((item) => item.modalidade === key);
  const genRule = rule(gen.modalidade);
  const sizeOptions = useMemo(() => {
    if (!genRule) return [] as number[];
    const fromTable = Object.keys(prices).filter((key) => key.startsWith(`${gen.modalidade}:`)).map((key) => Number(key.slice(gen.modalidade.length + 1))).filter((n) => Number.isInteger(n) && n >= genRule.min && n <= genRule.limit).sort((a, b) => a - b);
    return fromTable.length ? fromTable : Array.from({ length: genRule.limit - genRule.min + 1 }, (_, i) => genRule.min + i);
  }, [genRule, prices, gen.modalidade]);
  useEffect(() => { if (genRule && !sizeOptions.includes(Number(gen.dezenas))) setGen((current) => ({ ...current, dezenas: String(genRule.min) })); }, [genRule, sizeOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '30' });
      if (filter.modalidade) query.set('modalidade', filter.modalidade);
      if (filter.origem) query.set('origem', filter.origem);
      if (filter.dezenas) query.set('dezenas', filter.dezenas);
      if (filter.busca.trim()) query.set('busca', filter.busca.trim());
      if (filter.semUso) query.set('semUso', 'true');
      const data = await api<Rec>(`/api/v1/admin/numeros?${query.toString()}`);
      setList(data.items ?? []); setSummary(data.resumo ?? { total: 0, porModalidade: {} }); setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
    } catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível carregar o banco de números.'); }
    finally { setLoading(false); }
  }, [page, filter]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setGenBusy(true); setGenOut(null);
    try {
      const out = await api<Rec>('/api/v1/admin/numeros/gerar', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ modalidade: gen.modalidade, quantidade: Number(gen.quantidade), dezenas: Number(gen.dezenas), estrategia: gen.estrategia, ...(gen.fixos.trim() ? { fixos: gen.fixos.trim() } : {}), ...(gen.excluir.trim() ? { excluir: gen.excluir.trim() } : {}), ...(gen.rotulo.trim() ? { rotulo: gen.rotulo.trim() } : {}), salvar: gen.salvar }) });
      setGenOut(out);
      notify('success', out.salvo ? `${out.guardados} ${out.guardados === 1 ? 'jogo guardado' : 'jogos guardados'}${out.repetidos ? ` (${out.repetidos} já existiam)` : ''}.` : 'Jogos gerados (não guardados).');
      if (out.salvo) await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível gerar.'); }
    finally { setGenBusy(false); }
  }

  async function saveManual(event: FormEvent) {
    event.preventDefault();
    setManualBusy(true);
    try {
      const out = await api<Rec>('/api/v1/admin/numeros', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ modalidade: manual.modalidade, jogos: manual.jogos, ...(manual.rotulo.trim() ? { rotulo: manual.rotulo.trim() } : {}) }) });
      notify('success', `${out.guardados} ${out.guardados === 1 ? 'jogo guardado' : 'jogos guardados'}${out.repetidos ? ` (${out.repetidos} já existiam)` : ''}.`);
      setManual((current) => ({ ...current, jogos: '' })); await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível guardar.'); }
    finally { setManualBusy(false); }
  }

  async function remove(item: Rec) {
    if (!window.confirm('Tirar este jogo do banco? Bolões que já usam esses números não mudam.')) return;
    try { await api(`/api/v1/admin/numeros/${item.id}`, { method: 'DELETE' }); notify('success', 'Jogo removido do banco.'); await load(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível remover.'); }
  }
  async function copy(item: Rec) {
    try { await navigator.clipboard.writeText((item.numeros as number[]).map(pad).join(' ')); notify('success', 'Números copiados.'); } catch { notify('error', 'Não foi possível copiar.'); }
  }

  const unitCents = prices[`${gen.modalidade}:${gen.dezenas}`];
  const total = Math.min(Math.max(Math.trunc(Number(gen.quantidade) || 0), 0), 100);
  const manualRule = rule(manual.modalidade);

  return <>
    <div className="admin-mini-stats"><span>Jogos guardados <strong>{summary.total}</strong></span>{Object.entries(summary.porModalidade).map(([key, count]) => <span key={key}>{modalityNames[key] ?? key} <strong>{count}</strong></span>)}</div>
    <div className="bank-forms">
      <Panel title="Gerar números" description="Monta jogos pelo histórico da CAIXA e já guarda no banco. Não prevê resultado: todo jogo tem a mesma chance.">
        <form className="admin-form-grid admin-form-grid-three" onSubmit={generate}>
          <label className="admin-field"><span>Jogo</span><select value={gen.modalidade} onChange={(event) => setGen({ ...gen, modalidade: event.target.value })}>{rules.map((item) => <option key={item.modalidade} value={item.modalidade}>{modalityNames[item.modalidade] ?? item.modalidade}</option>)}</select></label>
          <label className="admin-field"><span>Quantos jogos (1 a 100)</span><input type="number" min={1} max={100} inputMode="numeric" value={gen.quantidade} onChange={(event) => setGen({ ...gen, quantidade: event.target.value })} /></label>
          <label className="admin-field"><span>Números em cada jogo</span><select value={gen.dezenas} onChange={(event) => setGen({ ...gen, dezenas: event.target.value })}>{sizeOptions.map((size) => <option key={size} value={size}>{size} números{prices[`${gen.modalidade}:${size}`] ? ` · ${brl(prices[`${gen.modalidade}:${size}`]!)}` : ''}</option>)}</select></label>
          <label className="admin-field"><span>Como escolher</span><select value={gen.estrategia} onChange={(event) => setGen({ ...gen, estrategia: event.target.value })}>{STRATEGIES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label className="admin-field"><span>Devem entrar (opcional)</span><input value={gen.fixos} onChange={(event) => setGen({ ...gen, fixos: event.target.value })} placeholder="Ex.: 7, 10" inputMode="numeric" /></label>
          <label className="admin-field"><span>Evitar (opcional)</span><input value={gen.excluir} onChange={(event) => setGen({ ...gen, excluir: event.target.value })} placeholder="Ex.: 13" inputMode="numeric" /></label>
          <label className="admin-field"><span>Nome do lote (opcional)</span><input maxLength={80} value={gen.rotulo} onChange={(event) => setGen({ ...gen, rotulo: event.target.value })} placeholder="Ex.: Mega da Virada" /></label>
          <label className="admin-toggle-row admin-field-wide"><input type="checkbox" checked={gen.salvar} onChange={(event) => setGen({ ...gen, salvar: event.target.checked })} /><span><strong>Guardar no banco de números</strong><small>Desmarque só se quiser apenas ver os jogos.</small></span></label>
          <div className="admin-field admin-field-wide"><button className="admin-button admin-button-primary" disabled={genBusy || !rules.length}>{genBusy ? 'Gerando…' : `Gerar ${total || ''} ${total === 1 ? 'jogo' : 'jogos'}`}</button>{unitCents !== undefined && total > 0 && <small className="admin-help"> Se apostar: {brl(unitCents)} por jogo · {brl(unitCents * total)} no total.</small>}</div>
        </form>
        {genOut && <div className="bank-result"><strong>{genOut.quantidade} {genOut.quantidade === 1 ? 'jogo gerado' : 'jogos gerados'} · {genOut.dezenas} números · custo na CAIXA {brl(genOut.custoTotalCentavos ?? 0)}</strong><small>{genOut.aviso}</small><ol>{(genOut.jogos as Rec[]).map((game) => <li key={game.ordem}><Balls numbers={game.numeros} /></li>)}</ol></div>}
      </Panel>

      <Panel title="Digitar números" description="Um jogo por linha, separado por espaço ou vírgula. Jogo repetido não é guardado de novo.">
        <form className="admin-form-grid" onSubmit={saveManual}>
          <label className="admin-field"><span>Jogo</span><select value={manual.modalidade} onChange={(event) => setManual({ ...manual, modalidade: event.target.value })}>{rules.map((item) => <option key={item.modalidade} value={item.modalidade}>{modalityNames[item.modalidade] ?? item.modalidade}</option>)}</select></label>
          <label className="admin-field"><span>Nome do lote (opcional)</span><input maxLength={80} value={manual.rotulo} onChange={(event) => setManual({ ...manual, rotulo: event.target.value })} /></label>
          <label className="admin-field admin-field-wide"><span>Números</span><textarea rows={5} value={manual.jogos} onChange={(event) => setManual({ ...manual, jogos: event.target.value })} placeholder={'Ex.: 04 12 23 35 44 58\n01 09 18 27 41 55'} /><small>{manualRule ? `${modalityNames[manual.modalidade]}: de ${manualRule.min} a ${manualRule.limit} números por jogo, de 1 a ${manualRule.max}.` : ''}</small></label>
          <div className="admin-field admin-field-wide"><button className="admin-button admin-button-primary" disabled={manualBusy || !manual.jogos.trim()}>{manualBusy ? 'Guardando…' : 'Guardar no banco'}</button></div>
        </form>
      </Panel>
    </div>

    <Panel title="Jogos guardados" description="Use no assistente de bolão (“Escolher do banco de números”). O banco também serve de base para cruzar com os resultados.">
      <div className="bank-filters">
        <select value={filter.modalidade} onChange={(event) => setFilter({ ...filter, modalidade: event.target.value })} aria-label="Jogo"><option value="">Todos os jogos</option>{rules.map((item) => <option key={item.modalidade} value={item.modalidade}>{modalityNames[item.modalidade] ?? item.modalidade}</option>)}</select>
        <select value={filter.origem} onChange={(event) => setFilter({ ...filter, origem: event.target.value })} aria-label="Origem"><option value="">Qualquer origem</option>{Object.entries(ORIGIN).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
        <input type="number" min={1} max={100} value={filter.dezenas} onChange={(event) => setFilter({ ...filter, dezenas: event.target.value })} placeholder="Nº de números" aria-label="Quantidade de números" />
        <input value={filter.busca} onChange={(event) => setFilter({ ...filter, busca: event.target.value })} placeholder="Tem o número… ou nome do lote" aria-label="Buscar" />
        <label className="vitrine-check"><input type="checkbox" checked={filter.semUso} onChange={(event) => setFilter({ ...filter, semUso: event.target.checked })} /> Só os ainda não usados</label>
      </div>
      {loading ? <p role="status">Carregando…</p> : list.length === 0 ? <Empty text="Nenhum jogo guardado ainda" hint="Gere ou digite números acima. Os jogos dos bolões que você criar também entram aqui." /> : <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth: 860 }}>
        <thead><tr><th>Números</th><th>Jogo</th><th>Qtd.</th><th>Origem</th><th>Lote</th><th>Usos</th><th>Criado</th><th>Ações</th></tr></thead>
        <tbody>{list.map((item) => <tr key={item.id}><td><Balls numbers={item.numeros} /></td><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>{item.quantidadeDezenas}</td><td>{ORIGIN[item.origem] ?? item.origem}{item.estrategia ? <small>{item.estrategia}</small> : null}</td><td>{item.rotulo ?? '—'}</td><td>{item.usos}</td><td>{dateTime(item.criadoEm)}</td><td><div className="admin-row-actions"><button type="button" className="admin-text-button" onClick={() => void copy(item)}>Copiar</button><button type="button" className="admin-text-button admin-danger" onClick={() => void remove(item)}>Excluir</button></div></td></tr>)}</tbody>
      </table></div>}
      {pagination.pages > 1 && <nav className="admin-toolbar" aria-label="Paginação do banco"><button type="button" className="admin-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {pagination.page} de {pagination.pages} · {pagination.total} jogos</span><button type="button" className="admin-button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Próxima</button></nav>}
    </Panel>
  </>;
}

/** Seletor usado no assistente de bolão: marca jogos do banco e devolve uma linha por jogo. */
export function BankPicker({ modalidade, onUse }: { modalidade: string; onUse: (lines: string[], mode: 'replace' | 'append') => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Rec[]>([]);
  const [sizes, setSizes] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let off = false;
    setLoading(true); setError('');
    const query = new URLSearchParams({ modalidade, pageSize: '100' });
    if (sizes) query.set('dezenas', sizes);
    if (onlyNew) query.set('semUso', 'true');
    api<Rec>(`/api/v1/admin/numeros?${query.toString()}`).then((data) => { if (!off) setItems(data.items ?? []); }).catch((failure) => { if (!off) setError(failure instanceof Error ? failure.message : 'Não foi possível abrir o banco.'); }).finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [open, modalidade, sizes, onlyNew]);
  useEffect(() => { setPicked(new Set()); }, [modalidade, sizes, onlyNew]);

  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chosen = items.filter((item) => picked.has(item.id));
  const lines = () => chosen.map((item) => (item.numeros as number[]).map(pad).join(' '));
  const sameSize = new Set(chosen.map((item) => item.quantidadeDezenas)).size <= 1;

  return <div className="bank-picker">
    <button type="button" className="admin-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Fechar o banco de números' : 'Escolher do banco de números'}</button>
    {open && <div className="bank-picker-body">
      <div className="bank-filters"><input type="number" min={1} max={100} value={sizes} onChange={(event) => setSizes(event.target.value)} placeholder="Nº de números por jogo" aria-label="Quantidade de números" /><label className="vitrine-check"><input type="checkbox" checked={onlyNew} onChange={(event) => setOnlyNew(event.target.checked)} /> Só os ainda não usados</label></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      {loading ? <p role="status">Carregando…</p> : items.length === 0 ? <p className="admin-muted">Nada guardado para {modalityNames[modalidade] ?? modalidade} com esse filtro. Gere ou digite em Jogos e vendas → Apostas → Banco de números.</p> : <ul className="bank-pick-list">
        {items.map((item) => <li key={item.id}><label><input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} /><Balls numbers={item.numeros} /><small>{item.usos ? `usado ${item.usos}x` : 'novo'}{item.rotulo ? ` · ${item.rotulo}` : ''}</small></label></li>)}
      </ul>}
      <div className="bank-picker-actions">
        <button type="button" className="admin-button admin-button-small admin-button-ghost" disabled={!items.length} onClick={() => setPicked(new Set(items.map((item) => item.id)))}>Marcar todos</button>
        <button type="button" className="admin-button admin-button-small admin-button-ghost" disabled={!picked.size} onClick={() => setPicked(new Set())}>Limpar</button>
        <button type="button" className="admin-button admin-button-small admin-button-primary" disabled={!chosen.length} onClick={() => onUse(lines(), 'replace')}>Usar {chosen.length || ''} {chosen.length === 1 ? 'jogo' : 'jogos'}</button>
        <button type="button" className="admin-button admin-button-small" disabled={!chosen.length} onClick={() => onUse(lines(), 'append')}>Acrescentar aos jogos escritos</button>
        {!sameSize && chosen.length > 0 && <small className="admin-help">Atenção: os jogos marcados têm quantidades de números diferentes.</small>}
      </div>
    </div>}
  </div>;
}
