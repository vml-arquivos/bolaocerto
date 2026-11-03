import Link from 'next/link';

const QUESTIONS: Array<{ q: string; a: React.ReactNode }> = [
  { q: 'Como funciona a cota de um bolão?', a: 'Cada bolão reúne vários jogos de um concurso oficial. Você reserva uma ou mais cotas, paga o valor da cota e participa proporcionalmente do prêmio. O valor da cota, a taxa de administração e quantas cotas ainda estão livres aparecem na página do bolão.' },
  { q: 'Quando recebo o comprovante do jogo?', a: 'O comprovante é liberado conforme o registro do jogo na lotérica. Você encontra o arquivo em Minha conta e recebe um aviso quando ele estiver disponível.' },
  { q: 'Quem paga o prêmio?', a: 'O prêmio é pago pela CAIXA, de acordo com o resultado oficial. A parte de cada cotista é proporcional às cotas que ele tem no bolão.' },
  { q: 'Onde vejo os resultados dos sorteios?', a: <>Na seção “Últimos resultados” desta página e em <Link href="/resultados">Resultados</Link>. Em Minha conta você vê quantos acertos cada jogo do seu bolão teve.</> },
  { q: 'O BL é da CAIXA?', a: 'Não. O BL — Bolão Livre é uma plataforma independente. Os concursos e os resultados exibidos são os oficiais da CAIXA.' },
  { q: 'Quem pode participar?', a: <>Somente maiores de 18 anos. Jogue com responsabilidade: conheça as orientações em <Link href="/jogo-responsavel">Jogo responsável</Link>.</> },
];

export function HomeFaq() {
  return <div className="faq-list">{QUESTIONS.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>;
}
