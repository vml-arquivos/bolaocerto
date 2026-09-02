import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminDashboard } from '../../components/admin-dashboard';

export const metadata: Metadata = {
  title: 'Centro de gestão | BL — Bolão Livre',
  description: 'Administração interna de concursos, bolões, cotas, recebimentos e operação BL.',
};

// PLATFORM_TEST_MODE é injetada em tempo de execução do container (ver
// docker-compose.production.yml), não em build. Sem isso, o Next pré-renderiza
// esta rota como estática no build e o valor de ambiente fica congelado -
// era por isso que o indicador nunca mudava de "produção" mesmo em validação.
export const dynamic = 'force-dynamic';

export default function AdminPage() {
  const testMode = process.env.PLATFORM_TEST_MODE === 'true';
  return <Suspense fallback={<div className="admin-loading"><p>Carregando administração…</p></div>}><AdminDashboard testMode={testMode} /></Suspense>;
}
