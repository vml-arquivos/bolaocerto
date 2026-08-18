type PublicPool = {
  id: string;
  concursoId: string;
  numerosApostados: number[];
  totalCotas: number;
  cotasDisponiveis: number;
  valorCota: string;
  taxaAdministracaoPct: string;
  modeloOperacional: string;
  status: string;
  teveGanhador: boolean;
};

async function loadPools(): Promise<{ pools: PublicPool[]; error: string | null }> {
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api/v1';
  try {
    const response = await fetch(`${baseUrl}/boloes`, { cache: 'no-store' });
    if (!response.ok) return { pools: [], error: `A API retornou HTTP ${response.status}.` };
    return { pools: await response.json() as PublicPool[], error: null };
  } catch {
    return { pools: [], error: 'O catálogo está temporariamente indisponível. Tente novamente em instantes.' };
  }
}

export default async function HomePage() {
  const { pools, error } = await loadPools();
  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a className="brand" href="/">Bolaocerto</a>
          <nav className="nav" aria-label="Navegação principal">
            <a href="#boloes">Bolões</a>
            <a href="#seguranca">Transparência</a>
            <a href="/login">Entrar</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="container hero">
          <div className="eyebrow">Concursos oficiais da Caixa</div>
          <h1>Participe de bolões com clareza em cada etapa.</h1>
          <p className="lede">Veja o valor do jogo separado da taxa de administração, acompanhe a reserva e consulte o status do registro com seu comprovante individual.</p>
        </section>
        <section className="container section" id="boloes">
          <div className="section-heading"><div><div className="eyebrow">Catálogo vivo</div><h2>Bolões disponíveis</h2></div><span className="pill">Dados da API</span></div>
          {error ? <div className="card error" role="alert"><strong>Não foi possível carregar o catálogo.</strong><p>{error}</p></div> : pools.length === 0 ? <div className="card"><strong>Nenhum bolão aberto encontrado.</strong><p>O catálogo será exibido assim que houver bolões cadastrados e disponíveis.</p></div> : <div className="grid">{pools.map((pool) => <article className="card" key={pool.id}><span className="pill">{pool.status}</span><h3>Bolão {pool.id.slice(0, 8)}</h3><p>Concurso: {pool.concursoId}</p><p>Números: {pool.numerosApostados.join(' · ')}</p><p><strong>R$ {pool.valorCota}</strong> por cota</p><p>{pool.cotasDisponiveis} de {pool.totalCotas} cotas disponíveis</p>{pool.teveGanhador && <p><span className="pill">Este bolão teve cotista premiado</span></p>}<a className="pill" href={`/boloes/${pool.id}`}>Ver detalhes</a></article>)}</div>}
        </section>
        <section className="container section" id="seguranca"><div className="card"><div className="eyebrow">Regras essenciais</div><h2>Seu prêmio não fica sob custódia da plataforma.</h2><p>A Bolaocerto intermedeia a compra de cotas e a operação do bolão. O resgate de qualquer prêmio é feito pelo próprio titular diretamente na Caixa ou em lotérica, usando o comprovante vinculado ao seu CPF.</p></div></section>
      </main>
      <footer className="footer"><div className="container">Bolaocerto · Plataforma de cotas de bolões oficiais · Termos, privacidade e suporte</div></footer>
    </>
  );
}
