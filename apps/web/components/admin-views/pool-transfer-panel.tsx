'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { modalityNames } from '../../lib/domain';
import { Panel, fetchAdmin } from './shared';

type Option = { id: string; grupo: string; grupoTipo: string; criador: string; status: string; livres: number | null; ilimitado: boolean; jogosIguais: boolean; jogos: number };
type Options = { origem: Record<string, any>; bloqueio: string | null; cotistas: Array<{ cotaId: string; nome: string; quantidade: number }>; reservasEmAberto: number; destinos: Option[] };
type Check = { ok: boolean; erros: string[]; avisos: string[]; cotas: number; pessoas: number; destino: { grupo: string; livresDepois: number | null } };

const post = (path: string, body: unknown) => fetchAdmin(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Passa os cotistas que já pagaram para outro bolão do mesmo concurso, valor e taxa. */
export function PoolTransferPanel({ pool, onClose, onDone, notify }: { pool: Record<string, any>; onClose: () => void; onDone: () => Promise<void> | void; notify: (kind: 'success' | 'error', text: string) => void }) {
  const [data, setData] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState('');
  const [destId, setDestId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [acceptDifferent, setAcceptDifferent] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fetchAdmin(`/api/v1/admin/boloes/${pool.id}/destinos-transferencia`)
      .then((result: Options) => { if (off) return; setData(result); setPicked(new Set(result.cotistas.map((item) => item.cotaId))); setDestId(result.destinos[0]?.id ?? ''); })
      .catch((error: unknown) => { if (!off) setLoadError(error instanceof Error ? error.message : 'Não foi possível abrir a transferência.'); });
    return () => { off = true; };
  }, [pool.id]);

  const dest = data?.destinos.find((item) => item.id === destId) ?? null;
  const movingCotas = useMemo(() => (data?.cotistas ?? []).filter((item) => picked.has(item.cotaId)).reduce((sum, item) => sum + item.quantidade, 0), [data, picked]);
  const body = (simular: boolean) => ({ destinoBolaoId: destId, cotaIds: [...picked], motivo: reason.trim(), confirmarJogosDiferentes: acceptDifferent, simular });
  const reset = () => setCheck(null);
  const name = `${modalityNames[pool.concurso?.modalidade] ?? pool.concurso?.modalidade ?? 'Bolão'} #${pool.concurso?.numeroConcurso ?? ''}`;

  async function conferir() {
    setBusy(true);
    try { setCheck(await post(`/api/v1/admin/boloes/${pool.id}/transferir-cotas`, body(true))); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível conferir.'); }
    finally { setBusy(false); }
  }
  async function transferir() {
    if (!check?.ok) return;
    if (!window.confirm(`Transferir ${check.cotas} cota(s) de ${check.pessoas} pessoa(s) para o grupo ${check.destino.grupo}? As pessoas serão avisadas.`)) return;
    setBusy(true);
    try {
      await post(`/api/v1/admin/boloes/${pool.id}/transferir-cotas`, body(false));
      notify('success', 'Cotistas transferidos. Eles foram avisados.');
      await onDone(); onClose();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível transferir. Nada foi alterado.'); setCheck(null); }
    finally { setBusy(false); }
  }

  const canCheck = Boolean(destId) && picked.size > 0 && !busy && (!dest || dest.jogosIguais || acceptDifferent);
  return <div ref={box}><Panel title={`Transferir cotistas · ${name} (grupo ${data?.origem.grupo ?? pool.grupo?.nome ?? ''})`} description="Passa quem já pagou para outro bolão do mesmo concurso, com o mesmo valor de cota e a mesma taxa. O dinheiro e o pagamento continuam valendo; só muda o bolão e o grupo da pessoa.">
    {loadError && <p className="admin-note" role="alert">{loadError}</p>}
    {!data && !loadError && <p className="admin-note">Carregando…</p>}
    {data?.bloqueio && <p className="admin-note" role="alert">{data.bloqueio}</p>}
    {data && !data.bloqueio && !data.cotistas.length && <p className="admin-note">Ninguém pagou neste bolão ainda. Não há o que transferir.{data.reservasEmAberto ? ` Há ${data.reservasEmAberto} reserva(s) aguardando pagamento; elas ficam aqui e vencem sozinhas.` : ''}</p>}
    {data && !data.bloqueio && data.cotistas.length > 0 && !data.destinos.length && <p className="admin-note">Não há outro bolão aberto do mesmo concurso, com o mesmo valor e a mesma taxa. Crie um bolão igual (Mais → Novo lote) e volte aqui.</p>}
    {data && !data.bloqueio && data.cotistas.length > 0 && data.destinos.length > 0 && <>
      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide"><span>Transferir para</span>
          <select value={destId} onChange={(event) => { setDestId(event.target.value); setAcceptDifferent(false); reset(); }}>
            {data.destinos.map((item) => <option key={item.id} value={item.id}>{item.grupo} · de {item.criador} · {item.ilimitado ? 'cotas ilimitadas' : `${item.livres} livre(s)`} · {item.jogosIguais ? 'mesmos jogos' : 'jogos diferentes'}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="transfer-people" style={{ border: 0, padding: 0, margin: '14px 0 0' }}>
        <legend className="admin-muted" style={{ marginBottom: 6 }}>Quem vai ({picked.size} de {data.cotistas.length} · {movingCotas} cota(s))</legend>
        <label className="transfer-person"><input type="checkbox" checked={picked.size === data.cotistas.length} onChange={(event) => { setPicked(event.target.checked ? new Set(data.cotistas.map((item) => item.cotaId)) : new Set()); reset(); }} /> <strong>Todos que já pagaram</strong></label>
        {data.cotistas.map((item) => <label key={item.cotaId} className="transfer-person"><input type="checkbox" checked={picked.has(item.cotaId)} onChange={(event) => { const next = new Set(picked); if (event.target.checked) next.add(item.cotaId); else next.delete(item.cotaId); setPicked(next); reset(); }} /> {item.nome} <span className="admin-muted">· {item.quantidade} cota{item.quantidade === 1 ? '' : 's'}</span></label>)}
      </fieldset>
      {data.reservasEmAberto > 0 && <p className="admin-note">{data.reservasEmAberto} reserva(s) ainda sem pagamento não entram: elas ficam neste bolão e vencem sozinhas.</p>}
      {dest && !dest.jogosIguais && <label className="transfer-person" style={{ marginTop: 10 }}><input type="checkbox" checked={acceptDifferent} onChange={(event) => { setAcceptDifferent(event.target.checked); reset(); }} /> Os jogos do bolão de destino são diferentes. Quero transferir mesmo assim.</label>}
      <label className="admin-field admin-field-wide" style={{ marginTop: 12 }}><span>Motivo (fica registrado)</span><input value={reason} maxLength={300} onChange={(event) => { setReason(event.target.value); reset(); }} placeholder="Ex.: o afiliado não vendeu o mínimo de cotas" /></label>
      {check && <div className={`admin-note ${check.ok ? '' : 'is-error'}`} role="status" style={{ marginTop: 12 }}>
        {check.ok
          ? <><strong>Tudo certo.</strong> Vão {check.cotas} cota(s) de {check.pessoas} pessoa(s) para o grupo {check.destino.grupo}{check.destino.livresDepois !== null ? `; sobram ${check.destino.livresDepois} livre(s) lá` : ''}.</>
          : <><strong>Não dá para transferir:</strong><ul style={{ margin: '6px 0 0 18px' }}>{check.erros.map((erro) => <li key={erro}>{erro}</li>)}</ul></>}
        {check.avisos.map((aviso) => <div key={aviso}>{aviso}</div>)}
      </div>}
    </>}
    <div className="wizard-actions" style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {data && !data.bloqueio && data.destinos.length > 0 && data.cotistas.length > 0 && <>
        <button type="button" className="admin-button" disabled={!canCheck || reason.trim().length < 3} onClick={() => void conferir()}>{busy && !check ? 'Conferindo…' : 'Conferir'}</button>
        <button type="button" className="admin-button admin-button-primary" disabled={!check?.ok || busy} onClick={() => void transferir()}>{busy && check ? 'Transferindo…' : 'Transferir agora'}</button>
      </>}
      <button type="button" className="admin-button admin-button-ghost" onClick={onClose}>Fechar</button>
    </div>
  </Panel></div>;
}
