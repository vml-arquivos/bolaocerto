'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { money } from '../lib/domain';

type User = { id: string; nome: string; email: string; papel: string; statusKyc: string };
type Share = { id: string; bolaoId: string; titularNome: string; status: string; quantidade: number; valorPago: string | null; comprovanteIndividualUrl: string | null; valorPremio?: string | null; expiraReservaEm?: string | null };

async function authenticatedFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) { const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' }); if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' }); }
  return response;
}

export function AccountDashboard() {
  const [user, setUser] = useState<User | null>(null); const [shares, setShares] = useState<Share[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { void (async () => { try { const [meResponse, sharesResponse] = await Promise.all([authenticatedFetch('/api/v1/auth/me'), authenticatedFetch('/api/v1/cotas/minhas')]); if (meResponse.status === 401) { window.location.href = '/login'; return; } if (!meResponse.ok || !sharesResponse.ok) throw new Error('Não foi possível carregar sua conta.'); setUser(await meResponse.json()); setShares(await sharesResponse.json()); } catch (issue) { setError(issue instanceof Error ? issue.message : 'Falha ao carregar.'); } finally { setLoading(false); } })(); }, []);
  async function logout(){ await fetch('/api/v1/auth/logout',{method:'POST',credentials:'include'}); window.location.href='/'; }
  if (loading) return <div className="empty-state"><span>BL</span><h3>Carregando sua conta…</h3></div>;
  if (error) return <div className="notice notice-error"><strong>Não foi possível abrir sua conta</strong><span>{error}</span></div>;
  const paid = shares.filter(item => ['paga','registrada','apurada','premiada'].includes(item.status)).length;
  return <><div className="page-heading"><div><span className="overline">Área do cotista</span><h1>Olá, {user?.nome?.split(' ')[0]}</h1><p className="muted">Acompanhe suas reservas, pagamentos e comprovantes.</p></div><div className="header-actions">{user?.papel === 'admin' && <Link className="button button-secondary" href="/admin">Administração</Link>}<button className="button button-ghost" onClick={logout}>Sair</button></div></div><div className="dashboard-grid"><article className="dashboard-card"><span className="overline">Participações</span><strong className="stat-value">{shares.length}</strong><small className="muted">reservas no histórico</small></article><article className="dashboard-card"><span className="overline">Confirmadas</span><strong className="stat-value">{paid}</strong><small className="muted">pagas ou registradas</small></article><article className="dashboard-card"><span className="overline">Verificação</span><strong className="stat-value stat-text">{user?.statusKyc?.replace('_',' ')}</strong><small className="muted">situação cadastral</small></article><article className="dashboard-card wide"><h2>Minhas cotas</h2>{shares.length ? <div className="share-list">{shares.map(share => <div className="share-item" key={share.id}><div><strong>Cota {share.id.slice(0,8)}</strong><small>Bolão {share.bolaoId.slice(0,8)} · {share.titularNome}</small></div><div><small>Quantidade</small><strong>{share.quantidade}</strong></div><div><small>Valor pago</small><strong>{money(share.valorPago)}</strong></div><div><span className="tag">{share.status}</span>{share.comprovanteIndividualUrl && <a className="text-link" href={share.comprovanteIndividualUrl} target="_blank" rel="noreferrer">Comprovante</a>}</div></div>)}</div> : <div className="empty-state compact"><h3>Você ainda não possui cotas</h3><p>Escolha um bolão disponível para iniciar sua participação.</p><Link className="button button-primary" href="/#boloes">Ver bolões</Link></div>}</article></div></>;
}
