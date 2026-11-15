import { concursoNo } from '../lib/contest';

const two = (value: number) => String(value).padStart(2, '0');

/**
 * Resultado oficial da CAIXA em destaque (vermelho): dezenas sorteadas do concurso
 * e, na Dupla Sena, o 2º sorteio. Usado na página do bolão, no histórico do cotista e nos bolões já sorteados.
 */
export function OfficialResult({ numbers, second = [], contest, title = 'Resultado oficial', compact = false }: { numbers: number[]; second?: number[]; contest?: number | null; title?: string; compact?: boolean }) {
  if (!numbers.length) return null;
  return <div className={`official-result${compact ? ' is-compact' : ''}`} role="group" aria-label={`${title}: ${numbers.map(two).join(', ')}`}>
    <div className="official-result-head"><strong>{title}</strong>{contest ? <small>Concurso {concursoNo(contest)} · CAIXA</small> : <small>CAIXA</small>}</div>
    <div className="official-result-balls">{numbers.map((n, i) => <span className="official-ball" key={`${n}-${i}`}>{two(n)}</span>)}</div>
    {second.length > 0 && <><small className="official-result-sub">2º sorteio</small><div className="official-result-balls">{second.map((n, i) => <span className="official-ball" key={`s-${n}-${i}`}>{two(n)}</span>)}</div></>}
  </div>;
}
