import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../../components/site-header';
import { apiGet } from '../../lib/api';
import { fmtDate, fmtInt, pad, StatsOverview } from '../../lib/stats';

export const metadata: Metadata = { title: 'Estatísticas e probabilidades', description: 'Histórico dos sorteios, frequência e atraso das dezenas, probabilidades exatas e análise do seu jogo — com transparência: estatística não é previsão.' };

export default async function StatsIndexPage() {
  const result = await apiGet<StatsOverview>('/estatisticas');
  const items = result.data?.modalidades ?? [];
  return <><SiteHeader /><main className="app-page" id="main-content"><div className="shell">
    <div className="st-hero">
      <span className="eyebrow-soft">Números que já saíram, matemática de cada jogo</span>
      <h1>Estatísticas e probabilidades</h1>
      <p>Explore o histórico de cada modalidade, veja quais dezenas saíram mais ou estão há mais tempo sem sair, confira as chances exatas de cada prêmio e analise o seu jogo. Tudo com clareza: o sorteio é aleatório e nenhuma estatística garante resultado.</p>
    </div>
    <div className="st-disclaimer" role="note"><strong>Estatística não é previsão.</strong> {result.data?.aviso ?? 'Cada sorteio é independente. Jogue com responsabilidade (18+).'}</div>
    {result.error && <div className="form-message form-error">{result.error}</div>}
    <div className="st-modalities">{items.map((item) => <Link key={item.modalidade} href={`/estatisticas/${item.modalidade}`} className="st-modality">
      <header><h2>{item.nome}</h2><span className="tag">{fmtInt(item.concursosNaBase)} concursos</span></header>
      <p className="st-muted">{item.dezenasSorteadas} dezenas entre {pad(item.universo.min)} e {pad(item.universo.max)} · prêmio máximo: 1 em {fmtInt(item.chancePremioMaximo.umEm)}</p>
      {item.ultimasDezenas.length > 0 ? <div><small className="st-muted">Último resultado{item.ultimoConcurso ? ` (concurso ${item.ultimoConcurso}, ${fmtDate(item.ultimaData)})` : ''}</small><div className="st-balls is-small">{item.ultimasDezenas.map((n) => <span className="st-ball" key={n}>{pad(n)}</span>)}</div></div> : <small className="st-muted">Importando histórico…</small>}
      <span className="st-link">Ver estatísticas →</span>
    </Link>)}</div>
    <p className="st-muted">Loteca e Super Sete não entram aqui porque não usam dezenas de um volante único.</p>
  </div></main><SiteFooter /></>;
}
