import { LiveStorefront } from '../components/live-storefront';
import { PoolHistory } from '../components/pool-history';
import { DrawnPools } from '../components/drawn-pools';
import { canPurchase } from '../lib/pool-availability';
import Image from 'next/image';
import Link from 'next/link';
import { LotteryCatalog } from '../components/lottery-catalog';
import { HomeCarousel, CarouselSlide } from '../components/home-carousel';
import { DrawCountdown, DrawItem } from '../components/draw-countdown';
import { ResultsTabs } from '../components/results-tabs';
import { HomeFaq } from '../components/home-faq';
import { PoolCard } from '../components/pool-card';
import { HomeConfig, ResultGroup, withHomeDefaults } from '../lib/home';
import { SiteFooter, SiteHeader } from '../components/site-header';
import { apiGet } from '../lib/api';
import { contestForModality, lotteryVisual, orderedLotteryVisuals } from '../lib/lottery-config';
import { modalityNames, money, PublicContest, PublicPool, shortDate } from '../lib/domain';
import { concursoNo, contestLabel, festaPrefix } from '../lib/contest';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const now = Date.now();
  const [poolResult, contestResult, historyResult, drawnResult, homeResult, resultsResult] = await Promise.all([
    apiGet<PublicPool[]>('/boloes/disponiveis'), apiGet<PublicContest[]>('/concursos'), apiGet<PublicPool[]>('/boloes/historico'), apiGet<PublicPool[]>('/boloes/sorteados'),
    apiGet<HomeConfig>('/home/config'), apiGet<ResultGroup[]>('/resultados/ultimos?porModalidade=5'),
  ]);
  const home = withHomeDefaults(homeResult.data);
  const show = home.secoes;
  const pools = poolResult.data ?? [];
  const poolById = new Map(pools.map((pool) => [pool.id, pool]));
  const drawnPools = drawnResult.data ?? [];
  const drawnIds = new Set(drawnPools.map((pool) => pool.id));
  const closedPools = (historyResult.data ?? []).filter((pool) => !drawnIds.has(pool.id));
  const contests = contestResult.data ?? [];
  const results = resultsResult.data ?? [];
  const openPools = pools.filter((pool) => canPurchase(pool, now)).length;
  const openContests = contests.filter((contest) => new Date(contest.cutoffAt).getTime() > now).length;

  // Carrossel: o que o administrador montou; se não houver nada ativo, os maiores prêmios abertos.
  const slides: CarouselSlide[] = [];
  for (const slide of home.slides.filter((item) => item.ativo)) {
    if (slide.tipo === 'bolao') {
      const pool = slide.bolaoId ? poolById.get(slide.bolaoId) : undefined;
      if (!pool) continue;
      const visual = lotteryVisual(pool.concurso?.modalidade);
      slides.push({
        key: slide.id, art: visual.art, accent: visual.accent, eyebrow: pool.concurso?.nomeEspecial ?? pool.grupo?.nome ?? 'Bolão BL',
        titulo: slide.titulo || `${modalityNames[pool.concurso?.modalidade ?? ''] ?? visual.name} · ${contestLabel(pool.concurso)}`,
        subtitulo: slide.subtitulo || `Cota de ${money(pool.valorCota)} · sorteio ${shortDate(pool.concurso?.dataSorteio)}`,
        valor: pool.concurso?.valorEstimadoPremio ? money(pool.concurso.valorEstimadoPremio) : undefined,
        botao: slide.botao || 'Ver bolão', href: `/boloes/${pool.id}`,
      });
    } else {
      const visual = lotteryVisual(slide.modalidade);
      slides.push({ key: slide.id, art: visual.art, accent: visual.accent, titulo: slide.titulo, subtitulo: slide.subtitulo, botao: slide.botao && slide.link ? slide.botao : undefined, href: slide.link });
    }
  }
  if (!slides.length) {
    const top = contests.filter((item) => new Date(item.cutoffAt).getTime() > now).sort((a, b) => Number(b.valorEstimadoPremio ?? 0) - Number(a.valorEstimadoPremio ?? 0)).slice(0, 3);
    for (const contest of top) {
      const visual = lotteryVisual(contest.modalidade);
      slides.push({ key: contest.id, art: visual.art, accent: visual.accent, eyebrow: festaPrefix(contest).replace(/ · $/, '') || visual.eyebrow, titulo: modalityNames[contest.modalidade] ?? visual.name, subtitulo: `${contestLabel(contest)} · sorteio ${shortDate(contest.dataSorteio)}`, valor: money(contest.valorEstimadoPremio), botao: 'Encontrar um bolão', href: '#boloes' });
    }
  }
  if (!slides.length) slides.push({ key: 'padrao', art: lotteryVisual('megasena').art, accent: lotteryVisual('megasena').accent, eyebrow: 'Concursos oficiais', titulo: 'Mais chances começam com uma boa escolha.', subtitulo: 'Encontre o concurso certo, escolha suas cotas e acompanhe cada etapa com a clareza do BL — Bolão Livre.', botao: 'Ver bolões disponíveis', href: '#boloes' });

  const featuredPools = home.destaques.map((id) => poolById.get(id)).filter((pool): pool is PublicPool => Boolean(pool));
  const drawItems: DrawItem[] = orderedLotteryVisuals().flatMap((visual) => {
    const contest = contestForModality(contests, visual.key);
    if (!contest || new Date(contest.cutoffAt).getTime() <= now) return [];
    return [{ key: visual.key, nome: modalityNames[visual.key] ?? visual.name, icon: visual.icon, accent: visual.accent, sorteioEm: contest.dataSorteio, premio: contest.valorEstimadoPremio ? money(contest.valorEstimadoPremio) : undefined, festa: contest.nomeEspecial ?? undefined }];
  });

  return <><LiveStorefront /><SiteHeader /><main id="main-content">
    <h1 className="sr-only">Bolão Livre: bolões de concursos oficiais</h1>
    <HomeCarousel slides={slides} />
    <div className="shell trust-row home-trust"><span><b>✓</b> Cotas rastreáveis</span><span><b>✓</b> Resultado oficial</span><span><b>✓</b> Jogo responsável</span></div>
    {show.numeros && <section className="numbers-strip"><div className="shell"><span><strong>{openContests}</strong> concursos abertos</span><span><strong>{openPools}</strong> bolões com cotas</span><span><strong>{contests.length}</strong> modalidades monitoradas</span><span><strong>18+</strong> experiência responsável</span></div></section>}
    {show.modalidades && drawItems.length > 0 && <section className="section-tight shell" id="modalidades" aria-label="Próximos sorteios"><div className="section-title compact"><div><h2>Próximos sorteios</h2></div><Link className="section-link" href="#concursos">Ver calendário <span aria-hidden="true">→</span></Link></div><DrawCountdown items={drawItems} serverNow={now} /></section>}
    {featuredPools.length > 0 && <section className="section shell" id="destaques"><div className="section-title"><div><span className="overline">Em destaque</span><h2>Escolhidos pelo BL</h2><p>Bolões com cotas abertas que merecem a sua atenção.</p></div></div><div className="pool-grid pool-grid-featured">{featuredPools.map((pool) => <PoolCard key={pool.id} pool={pool} now={now} />)}</div></section>}
    <section className="section soft-section" id="boloes"><div className="shell"><div className="section-title"><div><span className="overline">Catálogo BL</span><h2>Bolões disponíveis para você</h2><p>Compare cotas, prêmio estimado e prazo antes de participar.</p></div><span className="section-note"><b>{openPools}</b> oportunidades abertas agora</span></div>{poolResult.error ? <div className="notice notice-error"><strong>Catálogo temporariamente indisponível</strong><span>{poolResult.error}</span></div> : <LotteryCatalog pools={pools} serverNow={now} />}</div></section>
    {show.resultados && <section className="section shell" id="resultados"><div className="section-title"><div><span className="overline">Resultados oficiais</span><h2>Últimos resultados</h2><p>Os números sorteados de cada jogo, direto da CAIXA.</p></div><Link className="section-link" href="/resultados">Ver todos <span aria-hidden="true">→</span></Link></div>{resultsResult.error ? <p role="status">Resultados temporariamente indisponíveis.</p> : <ResultsTabs groups={results} moreHref="/resultados" />}</section>}
    {show.sorteados && drawnPools.length > 0 && <section className="section shell" id="sorteados"><div className="section-title"><div><span className="overline">Já sorteados</span><h2>Bolões já sorteados</h2><p>Confira os números oficiais e veja quantos acertos cada jogo teve.</p></div><Link className="section-link" href="/resultados">Ver todos</Link></div>{drawnResult.error ? <p role="status">Resultados temporariamente indisponíveis.</p> : <DrawnPools pools={drawnPools.slice(0, 6)} />}</section>}
    {show.encerrados && closedPools.length > 0 && <section className="section shell" id="encerrados"><div className="section-title"><div><span className="overline">Acompanhe seus bolões</span><h2>Vendas encerradas</h2><p>Estes bolões não recebem novas compras e aguardam o sorteio ou a apuração.</p></div><Link className="section-link" href="/resultados">Ver histórico</Link></div>{historyResult.error ? <p role="status">Resultados temporariamente indisponíveis. Tente novamente em instantes.</p> : <PoolHistory pools={closedPools.slice(0, 6)} />}</section>}
    {show.concursos && <section className="section shell" id="concursos"><div className="section-title"><div><span className="overline">Calendário oficial</span><h2>Próximos concursos</h2><p>Confira prêmio, concurso e data de sorteio em um só lugar.</p></div><span className="section-note"><i className="status-dot-indicator" /> Atualização automática</span></div><div className="contest-list">{contests.slice(0, 8).map((contest) => <article key={contest.id}><span className={`contest-icon ${contest.modalidade}`}>{lotteryVisual(contest.modalidade).icon}</span><div><strong>{modalityNames[contest.modalidade] ?? contest.modalidade}</strong><small>{contestLabel(contest)}</small></div><div><small>Prêmio estimado</small><strong>{money(contest.valorEstimadoPremio)}</strong></div><div><small>Sorteio</small><strong>{shortDate(contest.dataSorteio)}</strong></div><span className={`contest-status ${new Date(contest.cutoffAt).getTime() > now ? 'is-open' : 'is-closed'}`}>{new Date(contest.cutoffAt).getTime() > now ? 'Aberto' : 'Encerrado'}</span></article>)}{!contests.length && <p className="muted empty-list">Nenhum concurso sincronizado.</p>}</div></section>}
    {show.comoFunciona && <section className="section dark-section" id="como-funciona"><div className="shell"><div className="section-title dark-title"><div><span className="overline">Uma jornada mais clara</span><h2>Do concurso ao comprovante</h2><p>Informação objetiva para você decidir no seu ritmo.</p></div></div><div className="steps-grid"><article><span>01</span><h3>Escolha a modalidade</h3><p>Compare jogos, prêmios estimados e datas em uma navegação simples.</p></article><article><span>02</span><h3>Encontre sua cota</h3><p>Veja disponibilidade, valor, taxa e composição da participação.</p></article><article><span>03</span><h3>Reserve com segurança</h3><p>Confirme seus dados e acompanhe a reserva dentro da sua conta.</p></article><article><span>04</span><h3>Acompanhe o resultado</h3><p>Tenha histórico, comprovantes e status da sua participação.</p></article></div><div className="responsible-note"><strong>Jogue com responsabilidade.</strong><span>O BL é uma plataforma independente, não oficial da CAIXA, e o acesso é destinado a maiores de 18 anos.</span><Link href="/termos">Conheça as regras <span aria-hidden="true">→</span></Link></div></div></section>}
    {show.duvidas && <section className="section shell" id="duvidas"><div className="section-title"><div><span className="overline">Tire suas dúvidas</span><h2>Perguntas frequentes</h2></div></div><HomeFaq /></section>}
    <div className="shell responsible-strip"><strong>Jogue com responsabilidade.</strong> <span>O BL é uma plataforma independente, não oficial da CAIXA, e o acesso é destinado a maiores de 18 anos.</span> <Link href="/jogo-responsavel">Saiba mais</Link></div>
  </main><SiteFooter /></>;
}
