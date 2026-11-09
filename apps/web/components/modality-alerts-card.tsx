'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';

type State = { modalidades: string[]; disponiveis: Array<{ modalidade: string; nome: string }> };

/** "Avise-me quando abrir bolão de…": a pessoa marca os jogos e recebe um aviso quando um bolão oficial for publicado. */
export function ModalityAlertsCard() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void authenticatedFetch('/api/v1/usuarios/me/alertas-bolao').then((r) => (r.ok ? r.json() : null)).then((data: State | null) => setState(data)).catch(() => undefined);
  }, []);
  if (!state) return <p className="muted">Carregando…</p>;

  async function toggle(modalidade: string) {
    if (!state || busy) return;
    const next = state.modalidades.includes(modalidade) ? state.modalidades.filter((item) => item !== modalidade) : [...state.modalidades, modalidade];
    setBusy(true); setMessage('');
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/alertas-bolao', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modalidades: next }) });
      if (!response.ok) throw new Error('Não foi possível salvar agora.');
      const data = await response.json() as { modalidades: string[] };
      setState({ ...state, modalidades: data.modalidades });
      setMessage(data.modalidades.length ? 'Salvo. Você será avisado quando abrir bolão desses jogos.' : 'Avisos desligados.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }

  return <div className="modality-alerts">
    <p className="muted">Marque os jogos de que você quer ser avisado quando abrir um bolão oficial novo.</p>
    <div className="modality-alerts-grid" role="group" aria-label="Jogos para receber aviso">
      {state.disponiveis.map((item) => <label key={item.modalidade} className="field-check"><input type="checkbox" checked={state.modalidades.includes(item.modalidade)} disabled={busy} onChange={() => void toggle(item.modalidade)} /> <span>{item.nome}</span></label>)}
    </div>
    {message && <p className="muted" role="status"><small>{message}</small></p>}
  </div>;
}
