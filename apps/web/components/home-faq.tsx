import Link from 'next/link';

const QUESTIONS: Array<{ q: string; a: React.ReactNode }> = [
  { q: 'Como funciona a cota de um bolão?', a: 'Cada bolão reúne vários jogos de um concurso oficial. Você reserva uma ou mais cotas, paga o valor da cota e participa proporcionalmente do prêmio. O valor da cota, a taxa de administração e quantas cotas ainda estão livres aparecem na página do bolão.' },
  { q: 'Quando recebo o comprovante do jogo?', a: 'O comprovante é liberado conforme o registro do jogo na lotérica. Você encontra o arquivo em Minha conta e recebe um aviso quando ele estiver disponível.' },
  { q: 'O Bolão Livre fará jogos da Caixa?', a: (<>
    <p>Não. O Bolão Livre não realiza apostas e não é uma casa de apostas. A plataforma atua como uma empresa de tecnologia que facilita a organização de bolões de loterias oficiais, oferecendo serviços como gestão de participantes, controle de cotas, pagamentos, comunicação e acompanhamento dos grupos.</p>
    <p>As apostas são registradas nas unidades lotéricas ou pelos canais oficiais autorizados, conforme as regras aplicáveis a cada modalidade de loteria. O Bolão Livre cobra apenas uma taxa de serviço pela utilização da plataforma tecnológica e pela administração do bolão.</p>
    <p>A empresa possui objeto social compatível com a prestação de serviços tecnológicos, desenvolvimento e licenciamento de software, gestão de plataformas digitais, intermediação e serviços administrativos relacionados à sua operação, não tendo como atividade a exploração de apostas ou a operação de jogos de azar.</p>
    <p>Em resumo, o Bolão Livre organiza e administra bolões de loterias oficiais por meio de tecnologia; os jogos são registrados nos canais oficiais autorizados, e a empresa é remunerada exclusivamente pela prestação de seus serviços.</p></>) },
  { q: 'O Bolão Livre poderá disponibilizar todos os jogos da Caixa?', a: (<>
    <p>Sim. A plataforma foi desenvolvida para organizar bolões de todas as modalidades de loterias oficiais disponibilizadas pela Caixa Econômica Federal, como Mega-Sena, Lotofácil, Quina, Lotomania, Timemania, Dupla Sena, Dia de Sorte, Super Sete, +Milionária e demais modalidades que venham a ser lançadas.</p>
    <p>É importante destacar que o Bolão Livre não realiza as apostas. Sua função é oferecer uma plataforma tecnológica para organizar os bolões, gerenciar participantes, cotas e pagamentos. Os jogos são registrados nos canais oficiais autorizados da Caixa, enquanto o Bolão Livre é remunerado apenas pela prestação de seus serviços de tecnologia e administração.</p></>) },
  { q: 'Quem paga o prêmio?', a: 'O prêmio é pago pela CAIXA, de acordo com o resultado oficial. A parte de cada cotista é proporcional às cotas que ele tem no bolão.' },
  { q: 'Onde vejo os resultados dos sorteios?', a: <>Na seção “Últimos resultados” desta página e em <Link href="/resultados">Resultados</Link>. Em Minha conta você vê quantos acertos cada jogo do seu bolão teve.</> },
  { q: 'O BL é da CAIXA?', a: 'Não. O BL — Bolão Livre é uma plataforma independente. Os concursos e os resultados exibidos são os oficiais da CAIXA.' },
  { q: 'Quem pode participar?', a: <>Somente maiores de 18 anos. Jogue com responsabilidade: conheça as orientações em <Link href="/jogo-responsavel">Jogo responsável</Link>.</> },
];

export function HomeFaq() {
  return <div className="faq-list">{QUESTIONS.map((item) => <details key={item.q}><summary>{item.q}</summary>{typeof item.a === 'string' ? <p>{item.a}</p> : <div className="faq-answer">{item.a}</div>}</details>)}</div>;
}
