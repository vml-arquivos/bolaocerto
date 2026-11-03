import type { Metadata, Viewport } from 'next';

// O painel é um aplicativo à parte (outro ícone, outro nome, escopo só em /admin) e não deve aparecer em buscadores.
export const metadata: Metadata = {
  manifest: '/admin/manifest.webmanifest',
  applicationName: 'BL Admin',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/bl-admin-icon-192.png', apple: '/brand/bl-admin-icon-180.png' },
  appleWebApp: { capable: true, title: 'BL Admin', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f766e' },
    { media: '(prefers-color-scheme: dark)', color: '#04121a' },
  ],
  viewportFit: 'cover',
  colorScheme: 'dark light',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
