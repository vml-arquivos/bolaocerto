import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminDashboard } from '../../components/admin-dashboard';

export const metadata: Metadata = {
  title: 'Centro de gestão | BL — Bolão Livre',
  description: 'Administração interna de concursos, bolões, cotas, recebimentos e operação BL.',
};

export default function AdminPage() {
  return <Suspense fallback={<div className="admin-loading"><p>Carregando administração…</p></div>}><AdminDashboard /></Suspense>;
}
