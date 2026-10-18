import { money, PoolRelease } from '../lib/domain';

/** Mostra o gatilho de liberação de cotas de um bolão condicional (ex.: prêmio de R$ 100 milhões). */
export function ReleaseMeter({ release, compact = false }: { release: PoolRelease; compact?: boolean }) {
  if (!release.condicional) return null;
  const progress = Math.round(release.progressoPct ?? 0);
  return <div className={`release-meter ${release.liberado ? 'is-released' : 'is-locked'}`} role="status">
    <div className="release-meter-head"><strong>{release.liberado ? 'Cotas liberadas' : 'Bolão condicional'}</strong><span>Gatilho: {money(release.gatilho)}</span></div>
    <div className="progress" aria-label={`${progress}% do gatilho atingido`}><i style={{ width: `${progress}%` }} /></div>
    {!compact && <p>{release.mensagem}</p>}
    {compact && !release.liberado && <p>Libera com prêmio de {money(release.gatilho)} · faltam {money(release.faltam)}</p>}
  </div>;
}
