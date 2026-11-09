'use client';
import { FormEvent, useEffect, useState } from 'react';
import { modalityNames, money } from '../lib/domain';
import { ball } from '../lib/home';

type Modality = { modalidade: string; nome: string; min: number; max: number; minimoDezenas: number; maximoDezenas: number };
type Checked = { ordem: number; numeros: number[]; erro?: string; acertos?: number; numerosAcertados?: number[]; acertosSegundoSorteio?: number; numerosAcertadosSegundo?: number[]; premia?: boolean; faixa?: string | null; valorFaixa?: number | null; ganhadoresFaixa?: number | null };
type Outcome = { nome: string; concurso: number; dataSorteio: string; especial: string | null; numerosSorteados: number[]; numerosSegundoSorteio: number[]; jogos: Checked[]; aviso: string | null };

/** Converte o texto digitado (um jogo por linha) em listas de números. Aceita espaço, vírgula, ponto e vírgula e hífen. */
export function parseTypedGames(text: string): number[][] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,;.\-]+/).filter(Boolean).map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN)));
}

/** Conferidor: a pessoa digita os próprios jogos e vê os acertos no resultado oficial. Nada é gravado. */
export function GameChecker() {
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [modality, setModality] = useState('megasena');
  const [contest, setContest] = useState('');
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/v1/conferidor/modalidades').then((r) => (r.ok ? r.json() : [])).then((list: Modality[]) => setModalities(list)).catch(() => undefined);
  }, []);
  const rule = modalities.find((item) => item.modalidade === modality);

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(''); setOutcome(null);
    const games = parseTypedGames(text);
    if (!games.length) { setMessage('Digite pelo menos um jogo, um por linha.'); return; }
    if (games.some((game) => game.some((n) => Number.isNaN(n)))) { setMessage('Use só números separados por espaço ou vírgula.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/v1/conferidor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modalidade: modality, ...(contest.trim() ? { concurso: Number(contest) } : {}), jogos: games }) });
      const body = await response.json().catch(() => ({})) as Outcome & { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Não foi possível conferir agora.');
      setOutcome(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }

  const drawnSet = new Set(outcome?.numerosSorteados ?? []);
  return <section className="game-checker" aria-labelledby="conferidor-titulo">
    <h2 id="conferidor-titulo">Conferir meus jogos</h2>
    <p className="muted">Digite os seus números, um jogo por linha, e veja quantos acertos teve no último resultado oficial. Nada fica guardado.</p>
    <form onSubmit={submit} className="game-checker-form">
      <div className="form-row">
        <div className="field"><label htmlFor="conf-mod">Jogo</label><select id="conf-mod" value={modality} onChange={(e) => { setModality(e.target.value); setOutcome(null); }}>{(modalities.length ? modalities : [{ modalidade: 'megasena', nome: 'Mega-Sena' } as Modality]).map((item) => <option key={item.modalidade} value={item.modalidade}>{item.nome || modalityNames[item.modalidade]}</option>)}</select></div>
        <div className="field"><label htmlFor="conf-conc">Concurso (opcional)</label><input id="conf-conc" inputMode="numeric" pattern="[0-9]*" maxLength={5} value={contest} onChange={(e) => setContest(e.target.value.replace(/\D/g, ''))} placeholder="o último" /></div>
      </div>
      <div className="field"><label htmlFor="conf-jogos">Seus jogos{rule ? ` (${rule.minimoDezenas === rule.maximoDezenas ? `${rule.minimoDezenas} números` : `${rule.minimoDezenas} a ${rule.maximoDezenas} números`}, de ${rule.min} a ${rule.max})` : ''}</label><textarea id="conf-jogos" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'04 12 23 35 41 58\n01 02 03 04 05 06'} /></div>
      {message && <div className="form-message form-error" role="alert">{message}</div>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Conferindo…' : 'Conferir'}</button>
    </form>
    {outcome && <div className="game-checker-result" role="status">
      <p><strong>{outcome.nome} · concurso {outcome.concurso}</strong>{outcome.especial ? ` · ${outcome.especial}` : ''}</p>
      <div className="rs-balls" aria-label="Dezenas sorteadas"><div>{outcome.numerosSorteados.map((n, i) => <span className="rs-ball" key={`${n}-${i}`}>{ball(n)}</span>)}</div>{outcome.numerosSegundoSorteio.length > 0 && <div className="rs-second"><small>2º sorteio</small>{outcome.numerosSegundoSorteio.map((n, i) => <span className="rs-ball" key={`${n}-${i}`}>{ball(n)}</span>)}</div>}</div>
      <ol className="game-checker-list">{outcome.jogos.map((game) => <li key={game.ordem} className={game.erro ? 'is-error' : game.premia ? 'is-win' : ''}>
        <div className="gc-numbers">{game.numeros.map((n) => <span key={n} className={`gc-ball ${game.numerosAcertados?.includes(n) || game.numerosAcertadosSegundo?.includes(n) ? 'is-hit' : ''}`}>{ball(n)}</span>)}</div>
        {game.erro ? <small className="form-error">{game.erro}</small> : <small>{game.acertos} {game.acertos === 1 ? 'acerto' : 'acertos'}{game.acertosSegundoSorteio !== undefined ? ` · 2º sorteio: ${game.acertosSegundoSorteio}` : ''}{game.premia ? <> · <strong>{game.faixa}</strong>{game.valorFaixa ? ` — a CAIXA pagou ${money(game.valorFaixa)} por ganhador${game.ganhadoresFaixa ? ` (${game.ganhadoresFaixa} ganhador${game.ganhadoresFaixa === 1 ? '' : 'es'})` : ''}` : ''}</> : ' · sem prêmio'}</small>}
      </li>)}</ol>
      {outcome.aviso && <p className="muted"><small>{outcome.aviso}</small></p>}
      <p className="muted"><small>Conferência informativa. Vale sempre o resultado oficial da CAIXA e o seu bilhete.</small></p>
    </div>}
  </section>;
}
