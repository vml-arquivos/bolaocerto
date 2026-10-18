import { money, PublicPool, shortDate } from '../lib/domain';

const pad = (value: number) => String(value).padStart(2, '0');

/** Linha do tempo pública do bolão: do registro da aposta na CAIXA até a conferência jogo a jogo. */
export function PoolTransparency({ pool }: { pool: PublicPool }) {
  const info = pool.transparencia;
  if (!info) return null;
  const result = info.apuracao;
  const drawn = new Set(result?.sorteados ?? []);
  const drawnSecond = new Set(result?.segundoSorteio ?? []);
  const registered = Boolean(info.registradoEm);
  const settled = Boolean(info.apuradoEm && result);
  return <section className="transparency" aria-labelledby="transparencia-titulo">
    <span className="overline">Transparência</span>
    <h2 id="transparencia-titulo">Acompanhe este bolão</h2>
    <ol className="timeline">
      <li className="is-done"><strong>Cotas vendidas</strong><small>{pool.cotasVendidas ?? 0} cota(s) pagas</small></li>
      <li className={registered ? 'is-done' : ''}><strong>Aposta registrada na CAIXA</strong><small>{registered ? `${shortDate(info.registradoEm!)}${info.codigoBilhete ? ` · bilhete ${info.codigoBilhete}` : ''}` : 'aguardando o registro'}</small>{info.comprovanteUrl?.startsWith('https://') && <a className="text-link" href={info.comprovanteUrl} target="_blank" rel="noopener noreferrer">Ver comprovante da aposta</a>}</li>
      <li className={settled ? 'is-done' : ''}><strong>Resultado conferido</strong><small>{settled ? `${shortDate(info.apuradoEm!)} · concurso ${result!.concurso}` : 'aguardando o sorteio'}</small></li>
    </ol>
    {settled && result && <>
      <p className={`form-message ${pool.teveGanhador ? 'form-success' : ''}`} role="status">{pool.teveGanhador ? <>Este bolão foi premiado! Prêmio bruto total: <strong>{money(info.premioTotal)}</strong>, dividido entre as cotas na proporção da quantidade de cada uma.</> : 'Este bolão não teve prêmio neste concurso.'}</p>
      <div className="draw-line" aria-label="Dezenas sorteadas"><small>Sorteadas{result.segundoSorteio.length ? ' (1º sorteio)' : ''}:</small>{result.sorteados.map((n) => <span key={n} className="ball ball-drawn">{pad(n)}</span>)}</div>
      {result.segundoSorteio.length > 0 && <div className="draw-line" aria-label="Dezenas do segundo sorteio"><small>2º sorteio:</small>{result.segundoSorteio.map((n) => <span key={n} className="ball ball-drawn">{pad(n)}</span>)}</div>}
      <div className="game-results">{result.jogos.map((game) => <article key={game.ordem}>
        <header><strong>Jogo {pad(game.ordem)}</strong><span>{game.acertos} acerto(s){game.acertosSegundoSorteio !== null ? ` · 2º sorteio: ${game.acertosSegundoSorteio}` : ''}</span></header>
        <div className="draw-line">{game.numeros.map((n) => <span key={n} className={`ball ${drawn.has(n) || drawnSecond.has(n) ? 'ball-hit' : ''}`}>{pad(n)}</span>)}</div>
        {game.total > 0 && <small className="muted">{game.premios.map((prize) => prize.faixa).join(' + ')} · {money(game.total)}</small>}
      </article>)}</div>
      <p className="muted small-print">Valores brutos, como informados pela CAIXA, antes de qualquer imposto retido por ela no pagamento do prêmio. O prêmio é pago pela CAIXA; a taxa de administração não incide sobre ele.</p>
    </>}
  </section>;
}
