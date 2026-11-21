'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { startViewAs, stopViewAs, viewAsId } from '../lib/view-as';

const ROLE_NAMES: Record<string, string> = { admin: 'Administrador', operacao: 'Operação' };

/** Faixa no topo do painel enquanto a conta principal vê o painel como outra pessoa. */
export function ViewAsBanner() {
  const [who, setWho] = useState<{ nome: string; papel: string } | null>(null);
  useEffect(() => {
    if (!viewAsId()) return;
    void authenticatedFetch('/api/v1/auth/me', { cache: 'no-store' }).then(async (response) => {
      const me = response.ok ? await response.json() : null;
      if (me?.verComo) setWho({ nome: me.nome, papel: me.papel });
      else stopViewAs('/admin');
    }).catch(() => undefined);
  }, []);
  if (!who) return null;
  return <div className="view-as-banner" role="status">
    <span>Você está vendo o painel como <strong>{who.nome}</strong> ({ROLE_NAMES[who.papel] ?? who.papel}). Só para olhar: nada pode ser alterado.</span>
    <button type="button" className="admin-button admin-button-small" onClick={() => stopViewAs()}>Voltar para a minha conta</button>
  </div>;
}

type Member = { id: string; nome: string; email: string; papel: string; desativadoEm: string | null };

/** Conta principal: escolhe alguém da equipe e abre o painel do jeito que essa pessoa vê. */
export function ViewAsPicker() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [chosen, setChosen] = useState('');
  useEffect(() => {
    void authenticatedFetch('/api/v1/admin/usuarios?papel=equipe&page=1&pageSize=100', { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items?: Member[] }) => setMembers((data.items ?? []).filter((item) => !item.desativadoEm)))
      .catch(() => setMembers([]));
  }, []);
  const options = (members ?? []).filter((item) => item.papel === 'admin' || item.papel === 'operacao');
  return <section className="admin-create-panel view-as-picker" aria-label="Ver o painel como outra pessoa">
    <div className="admin-create-heading"><div><strong>Ver o painel como…</strong><small>Abre o painel exatamente como a pessoa vê, só para conferir.</small></div></div>
    <div className="view-as-row">
      <select value={chosen} onChange={(event) => setChosen(event.target.value)} aria-label="Pessoa da equipe">
        <option value="">{members === null ? 'Carregando…' : options.length ? 'Escolha alguém da equipe' : 'Ninguém da equipe ainda'}</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.nome} · {ROLE_NAMES[item.papel] ?? item.papel}</option>)}
      </select>
      <button type="button" className="admin-button admin-button-primary" disabled={!chosen} onClick={() => startViewAs(chosen)}>Ver painel</button>
    </div>
  </section>;
}
