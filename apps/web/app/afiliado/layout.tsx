import type { Metadata, Viewport } from 'next';

// A área do afiliado é um aplicativo à parte (outro ícone, outro nome, escopo só em /afiliado) e não aparece em buscadores.
export const metadata: Metadata = {
  title: 'BL Afiliado',
  manifest: '/afiliado/manifest.webmanifest',
  applicationName: 'BL Afiliado',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/bl-afiliado-icon-192.png', apple: '/brand/bl-afiliado-icon-180.png' },
  appleWebApp: { capable: true, title: 'BL Afiliado', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#d97706' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1204' },
  ],
  viewportFit: 'cover',
  colorScheme: 'dark light',
};

export default function AffiliateLayout({ children }: { children: React.ReactNode }) { return children; }
