'use client';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { ACCESS_MODULES } from '../lib/access';

type Detail = { personalizado: boolean; modulos: string[]; padrao: string[]; papel: string };

async function call(path: string, init?: RequestInit) {
  const response = await authenticatedFetch(path, { ...init, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível concluir.');
  return result;
}

/**
 * Só a conta principal vê: liga e desliga, uma a uma, as funções do painel que esta pessoa da equipe pode usar.
 * O que fica desligado some do menu dela e a API recusa.
 */
export function AccessPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'erro'; text: string } | null>(null);
  useEffect(() => {
    let off = false;
    call(`/api/v1/admin/acessos/${userId}`).then((data: Detail) => { if (!off) { setDetail(data); setChosen(data.modulos); } }).catch((error) => { if (!off) setMessage({ type: 'erro', text: error.message }); });
    return () => { off = true; };
  }, [userId]);
  const sections = useMemo(() => [...new Set(ACCESS_MODULES.map((item) => item.section))], []);
  const changed = detail ? [...chosen].sort().join() !== [...detail.modulos].sort().join() : false;
  const toggle = (key: string) => setChosen((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));
  async function save(modulos: string[] | null) {
    setBusy(true); setMessage(null);
    try {
      const data: Detail = await call(`/api/v1/admin/acessos/${userId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modulos }) });
      setDetail(data); setChosen(data.modulos);
      setMessage({ type: 'ok', text: modulos === null ? 'Acesso voltou ao padrão do perfil.' : `Acesso salvo: ${data.modulos.length} ${data.modulos.length === 1 ? 'função liberada' : 'funções liberadas'}. Vale em até 30 segundos (a pessoa atualiza a página).` });
    } catch (error) { setMessage({ type: 'erro', text: error instanceof Error ? error.message : 'Não foi possível salvar.' }); }
    finally { setBusy(false); }
  }
  return <section className="access-panel" aria-label="Funções liberadas">
    <hr/><h3>Funções liberadas no painel</h3>
    <p className="admin-help">Marque o que esta pessoa pode usar. O que ficar desmarcado some do menu dela e o sistema recusa, mesmo pelo endereço direto. {detail ? (detail.personalizado ? <strong>Acesso personalizado.</strong> : <strong>Seguindo o padrão do perfil.</strong>) : null}</p>
    {message && <p role="status" className={`notice ${message.type === 'erro' ? 'is-error' : ''}`}>{message.text}</p>}
    {!detail && !message && <p>Carregando funções…</p>}
    {detail && <>
      <div className="access-actions">
        <button type="button" className="admin-button admin-button-ghost admin-button-small" disabled={busy} onClick={() => setChosen(ACCESS_MODULES.map((item) => item.key))}>Marcar tudo</button>
        <button type="button" className="admin-button admin-button-ghost admin-button-small" disabled={busy} onClick={() => setChosen([])}>Desmarcar tudo</button>
        <button type="button" className="admin-button admin-button-ghost admin-button-small" disabled={busy} onClick={() => setChosen(detail.padrao)}>Marcar o padrão do perfil</button>
      </div>
      <div className="access-grid">
        {sections.map((section) => <fieldset key={section} className="access-section"><legend>{section}</legend>
          {ACCESS_MODULES.filter((item) => item.section === section).map((item) => <label key={item.key} className="access-item"><input type="checkbox" checked={chosen.includes(item.key)} disabled={busy} onChange={() => toggle(item.key)} /><span>{item.label}</span>{!detail.padrao.includes(item.key) && <small>fora do padrão</small>}</label>)}
        </fieldset>)}
      </div>
      <div className="access-actions">
        <button type="button" className="admin-button" disabled={busy || !changed} onClick={() => void save(chosen)}>{busy ? 'Salvando…' : 'Salvar funções'}</button>
        {detail.personalizado && <button type="button" className="admin-button admin-button-ghost" disabled={busy} onClick={() => { if (window.confirm('Voltar ao padrão do perfil? As escolhas feitas aqui deixam de valer.')) void save(null); }}>Voltar ao padrão do perfil</button>}
      </div>
      <p className="admin-help">Criar administrador, excluir cota vendida e apagar grupos continuam só da conta principal.</p>
    </>}
  </section>;
}
