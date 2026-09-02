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
  themeColor: '#2145d7',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
