import './globals.css';
import './details.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'BL — Bolão Livre', template: '%s | BL — Bolão Livre' },
  description: 'Acompanhe concursos oficiais, escolha seu bolão e gerencie suas cotas com transparência e rastreabilidade.',
  applicationName: 'BL — Bolão Livre',
  icons: {
    icon: '/brand/bl-app-icon.png',
    apple: '/brand/bl-app-icon.png',
  },
  openGraph: {
    title: 'BL — Bolão Livre',
    description: 'Concursos oficiais, cotas rastreáveis e uma experiência clara para acompanhar cada etapa.',
    type: 'website',
    locale: 'pt_BR',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5fb' },
    { media: '(prefers-color-scheme: dark)', color: '#060c24' },
  ],
  colorScheme: 'dark light',
};

// Aplica o tema salvo (ou a preferência do sistema) antes da primeira pintura,
// evitando o "flash" do tema incorreto. Roda de forma síncrona e bloqueante.
const themeInitScript = `(function(){try{var s=localStorage.getItem('bl-theme');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head><body suppressHydrationWarning>{children}</body></html>;
}
