import Link from 'next/link';
import { InstallAppButton } from '../../components/pwa-register';
import { SiteHeader, SiteFooter } from '../../components/site-header';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Instalar Bolão Livre' };

function safeUrl(value?: string) { try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }

export default function InstallPage() {
  const apk = safeUrl(process.env.ANDROID_APK_URL);
  const play = safeUrl(process.env.ANDROID_PLAY_URL);
  return <><SiteHeader/><main className="shell document-page" id="main-content">
    <span className="overline">Aplicativos do Bolão Livre</span>
    <h1>Bolão Livre na sua tela inicial</h1>
    <p>São três aplicativos, cada um com o seu ícone e só com o que a pessoa precisa: o do cotista, o do afiliado e o da equipe. Cada um é instalado na própria entrada e pode ficar no mesmo aparelho.</p>
    <div className="install-apps" aria-label="Escolha o aplicativo">
      <article className="install-app-card"><img src="/brand/bl-icon-192.png" alt="" width="64" height="64" /><div><strong>Bolão Livre</strong><small>Para quem compra cotas: bolões, pagamentos, comprovantes, contratos e resultados.</small></div><InstallAppButton label="Instalar o app do cotista" /></article>
      <article className="install-app-card"><img src="/brand/bl-afiliado-icon-192.png" alt="" width="64" height="64" /><div><strong>BL Afiliado</strong><small>Para quem divulga: cotas e vendas do seu link, bolões, grupos e comissões.</small></div><Link className="button button-secondary" href="/afiliado/entrar">Abrir e instalar o BL Afiliado</Link></article>
      <article className="install-app-card"><img src="/brand/bl-admin-icon-192.png" alt="" width="64" height="64" /><div><strong>BL Admin</strong><small>Para a equipe: concursos, bolões, cotas, recebimentos e comprovantes.</small></div><Link className="button button-secondary" href="/admin/entrar">Abrir e instalar o BL Admin</Link></article>
    </div>
    <p className="muted">O botão de instalar do navegador instala o aplicativo da página em que você está. Por isso o afiliado e a equipe instalam pela própria tela de entrada.</p>
    {(play || apk) && <div className="install-android-links"><h2>Aplicativo para Android</h2>{play && <a className="button button-secondary" href={play} rel="noopener">Baixar na Google Play</a>}{apk && <a className="button button-ghost" href={apk} rel="noopener" download>Baixar o APK</a>}{apk && <p className="muted">O APK é instalado fora da loja: o Android pede para permitir a instalação de fontes desconhecidas para o navegador que você usou.</p>}</div>}
    <h2>Como instalar no Android</h2>
    <ol className="install-steps"><li>Abra este site no <strong>Chrome</strong> (não use o navegador de dentro do WhatsApp ou Instagram).</li><li>Toque em <strong>Instalar aplicativo</strong> acima. Se nada abrir, toque nos três pontinhos ⋮ do Chrome e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme. O ícone do Bolão Livre aparece na tela inicial e o app abre em tela cheia.</li></ol>
    <h2>Como instalar no iPhone e iPad</h2>
    <p>Abra o endereço no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Mantenha “Abrir como App” ativado, se essa opção aparecer. Depois, abra pelo ícone na tela inicial. A instalação precisa ser confirmada por você.</p>
    <h2>Avisos no celular</h2>
    <p>Depois de instalar, entre na sua conta e ative os avisos em “Minha conta”. No iPhone, os avisos só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais novo).</p>
    <h2>Conexão e atualizações</h2>
    <p>Compras e consultas de pagamentos exigem internet. Sem conexão, o aplicativo informa a indisponibilidade; não registra compras nem pagamentos offline. Ao retornar, confira o status na conta antes de repetir uma operação. Quando houver nova versão, conclua a operação em andamento e use “Atualizar aplicativo”.</p>
    <p>Se estiver no navegador interno de WhatsApp ou Instagram, abra o link no Safari ou Chrome. A instalação e os nomes dos menus dependem do navegador e da versão do sistema.</p>
    <Link className="button button-secondary" href="/aplicativo">Abrir aplicativo do cotista</Link>
  </main><SiteFooter/></>;
}
