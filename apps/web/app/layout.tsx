import './globals.css';
import './details.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'BL — Bolão Livre', template: '%s | BL — Bolão Livre' },
  description: 'Acompanhe concursos oficiais, escolha seu bolão e gerencie suas cotas com transparência e rastreabilidade.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
