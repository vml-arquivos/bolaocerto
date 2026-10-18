import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '../../components/site-header';

export const metadata: Metadata = { title: 'Jogo responsável' };

export default function ResponsibleGamingPage() {
  return (
    <>
      <SiteHeader />
      <main className="document-page shell" id="main-content">
        <span className="overline">Cuidado</span>
        <h1>Jogo responsável</h1>
        <p>Loterias e bolões são entretenimento, não fonte de renda. Nenhuma estatística, previsão ou análise do BL aumenta a chance de acerto: cada sorteio oficial é independente e aleatório.</p>
        <h2>Boas práticas</h2>
        <p>Defina um valor mensal que você pode gastar sem prejudicar suas contas e não ultrapasse esse limite. Nunca use dinheiro de aluguel, alimentação, dívidas ou de terceiros. Não tente “recuperar” perdas apostando mais.</p>
        <h2>Somente para maiores de 18 anos</h2>
        <p>O cadastro e a participação são proibidos para menores de 18 anos. Se você é responsável por um menor, use ferramentas de controle parental no aparelho dele.</p>
        <h2>Sinais de alerta</h2>
        <p>Gastar mais do que planejou, esconder apostas de familiares, sentir ansiedade quando não está jogando ou deixar compromissos de lado são sinais para parar e pedir ajuda.</p>
        <h2>Onde buscar ajuda</h2>
        <p>Procure apoio profissional na rede pública de saúde (CAPS e UBS) ou o CVV (telefone 188, 24 horas, gratuito). Grupos como Jogadores Anônimos também oferecem acolhimento gratuito.</p>
        <h2>Pausar ou encerrar sua conta</h2>
        <p>Você pode solicitar a exclusão da sua conta a qualquer momento em Minha conta &gt; Privacidade. Para pedir uma pausa ou um limite de participações, fale com o suporte.</p>
      </main>
      <SiteFooter />
    </>
  );
}
