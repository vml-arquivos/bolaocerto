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
    <span className="overline">Aplicativo do cotista</span>
    <h1>Bolão Livre na sua tela inicial</h1>
    <p>Consulte bolões, compre cotas e acompanhe pagamentos, comprovantes, contratos e resultados com sua mesma conta.</p>
    <InstallAppButton/>
    {(play || apk) && <div className="install-android-links"><h2>Aplicativo para Android</h2>{play && <a className="button button-secondary" href={play} rel="noopener">Baixar na Google Play</a>}{apk && <a className="button button-ghost" href={apk} rel="noopener" download>Baixar o APK</a>}{apk && <p className="muted">O APK é instalado fora da loja: o Android pede para permitir a instalação de fontes desconhecidas para o navegador que você usou.</p>}</div>}
    <h2>Android</h2>
    <ol className="install-steps"><li>Abra este site no <strong>Chrome</strong> (não use o navegador de dentro do WhatsApp ou Instagram).</li><li>Toque em <strong>Instalar aplicativo</strong> acima. Se nada abrir, toque nos três pontinhos ⋮ do Chrome e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme. O ícone do Bolão Livre aparece na tela inicial e o app abre em tela cheia.</li></ol>
    <h2>iPhone e iPad</h2>
    <p>Abra o endereço no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Mantenha “Abrir como App” ativado, se essa opção aparecer. Depois, abra pelo ícone na tela inicial. A instalação precisa ser confirmada por você.</p>
    <h2>Avisos no celular</h2>
    <p>Depois de instalar, entre na sua conta e ative os avisos em “Minha conta”. No iPhone, os avisos só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais novo).</p>
    <h2>Conexão e atualizações</h2>
    <p>Compras e consultas de pagamentos exigem internet. Sem conexão, o aplicativo informa a indisponibilidade; não registra compras nem pagamentos offline. Ao retornar, confira o status na conta antes de repetir uma operação. Quando houver nova versão, conclua a operação em andamento e use “Atualizar aplicativo”.</p>
    <p>Se estiver no navegador interno de WhatsApp ou Instagram, abra o link no Safari ou Chrome. A instalação e os nomes dos menus dependem do navegador e da versão do sistema.</p>
    <Link className="button button-secondary" href="/aplicativo">Abrir aplicativo do cotista</Link>
    <p className="muted">É da equipe do BL? O painel tem um aplicativo próprio (BL Admin): abra <Link href="/admin/entrar">/admin/entrar</Link> e instale por lá.</p>
  </main><SiteFooter/></>;
}
