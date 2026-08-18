import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bolaocerto | Bolões oficiais',
  description: 'Compre cotas de bolões de concursos oficiais da Caixa com transparência e rastreabilidade.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
