'use client';

import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, authFetch, dateTime, Empty, modalityNames, Notify, Rec } from './admin-ui';
import { OpenFileButton } from './open-file-button';
import { ATTACHMENT_LABELS, fileSize } from '../lib/files';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';

/**
 * Arquivos de um bolão: comprovante da aposta, jogos registrados e recibos por cota.
 * `shares` (opcional) permite ligar um recibo a uma cota; `forceShareId` já deixa a cota escolhida.
 */
export function AttachmentsPanel({ poolId, shares = [], forceShareId, defaultType = 'comprovante_aposta', notify, onChange }: { poolId: string; shares?: Rec[]; forceShareId?: string; defaultType?: string; notify: Notify; onChange?: (count: number) => void }) {
  const [files, setFiles] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState(forceShareId ? 'recibo_cota' : defaultType);
  const [shareId, setShareId] = useState(forceShareId ?? '');
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(true);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<Rec[] | null>(null);
  // Sem a lista de cotas pronta, busca só quando a pessoa escolhe "Recibo da cota".
  useEffect(() => { if (type === 'recibo_cota' && !shares.length && own === null) api<Rec[]>(`/api/v1/operacao/boloes/${poolId}/cotas`).then(setOwn).catch(() => setOwn([])); }, [type, shares.length, own, poolId]);
  const shareOptions = shares.length ? shares : own ?? [];

  const load = useCallback(async () => {
    try { const list = await api<Rec[]>(`/api/v1/operacao/boloes/${poolId}/anexos`); setFiles(list); onChange?.(list.length); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível carregar os arquivos.'); }
    finally { setLoading(false); }
  }, [poolId, notify, onChange]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  async function send(list: FileList | File[]) {
    const selected = Array.from(list);
    if (!selected.length) return;
    if (type === 'recibo_cota' && !shareId) { notify('error', 'Escolha a cota a que o recibo pertence.'); return; }
    setBusy(true);
    let okCount = 0;
    for (const file of selected) {
      const form = new FormData();
      form.set('tipo', type);
      if (type === 'recibo_cota') form.set('cotaId', shareId);
      if (note.trim()) form.set('descricao', note.trim());
      form.set('visivelParticipantes', String(visible));
      form.set('arquivo', file);
      try {
        const response = await authFetch(`/api/v1/operacao/boloes/${poolId}/anexos`, { method: 'POST', body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message) || 'Não foi possível enviar o arquivo.');
        okCount += 1;
      } catch (failure) { notify('error', `${file.name}: ${failure instanceof Error ? failure.message : 'falha no envio.'}`); }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (okCount) { notify('success', okCount === 1 ? 'Arquivo enviado.' : `${okCount} arquivos enviados.`); setNote(''); }
    await load();
  }

  async function toggle(file: Rec) {
    try { await api(`/api/v1/operacao/anexos/${file.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visivelParticipantes: !file.visivelParticipantes }) }); await load(); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível alterar.'); }
  }
  async function remove(file: Rec) {
    if (!window.confirm(`Remover "${file.nome}"? Ele deixa de aparecer, mas fica guardado no histórico.`)) return;
    try { await api(`/api/v1/operacao/anexos/${file.id}`, { method: 'DELETE' }); notify('success', 'Arquivo removido.'); await load(); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível remover.'); }
  }
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setOver(false); void send(event.dataTransfer.files); }

  return <div className="attach-panel">
    <div className="attach-form">
      <div className="admin-form-grid">
        <label className="admin-field"><span>O que você vai enviar</span>
          <select value={type} onChange={(event) => setType(event.target.value)} disabled={Boolean(forceShareId)}>
            {Object.entries(ATTACHMENT_LABELS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        {type === 'recibo_cota' && <label className="admin-field"><span>De qual cota</span>
          <select value={shareId} onChange={(event) => setShareId(event.target.value)} disabled={Boolean(forceShareId)}>
            <option value="">Escolha…</option>
            {shareOptions.map((share) => <option key={share.id} value={share.id}>{share.titularNome} · {share.quantidade} cota(s)</option>)}
          </select>
        </label>}
        <label className="admin-field"><span>Observação (opcional)</span><input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: bilhete 1 de 3" /></label>
      </div>
      <label className="attach-check"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Quem participa do bolão pode ver este arquivo</label>
      <label className={`attach-drop ${over ? 'is-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input ref={input} type="file" accept={ACCEPT} multiple onChange={(event) => event.target.files && void send(event.target.files)} disabled={busy} />
        <strong>{busy ? 'Enviando…' : 'Toque para escolher ou arraste os arquivos aqui'}</strong>
        <small>PDF, PNG, JPG ou WEBP · até 10 MB cada</small>
      </label>
    </div>
    {loading ? <p className="admin-help">Carregando arquivos…</p> : files.length === 0 ? <Empty text="Nenhum arquivo ainda" hint="Envie o comprovante da aposta feita na lotérica." /> : <ul className="attach-list">
      {files.map((file) => <li key={file.id}>
        <div className="attach-info"><strong>{file.nome}</strong>
          <small>{ATTACHMENT_LABELS[file.tipo] ?? file.tipo}{file.titular ? ` · ${file.titular}` : ''} · {fileSize(file.tamanho)} · {dateTime(file.enviadoEm)}{file.enviadoPor ? ` · ${file.enviadoPor}` : ''}</small>
          {file.descricao && <small>{file.descricao}</small>}
          <small className="attach-hash" title="Impressão digital do arquivo: muda se o arquivo for alterado">código {String(file.sha256).slice(0, 12)}…</small>
        </div>
        <div className="attach-actions">
          <OpenFileButton id={file.id} className="admin-button admin-button-small" />
          <button type="button" className={`admin-button admin-button-small ${file.visivelParticipantes ? '' : 'admin-button-ghost'}`} onClick={() => void toggle(file)} title="Quem participa do bolão pode ver?">{file.visivelParticipantes ? 'Visível' : 'Oculto'}</button>
          <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => void remove(file)}>Remover</button>
        </div>
      </li>)}
    </ul>}
  </div>;
}

/** Janela simples para abrir painéis sobre a tela atual. */
export function AdminModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="admin-modal"><header><h2>{title}</h2><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={onClose} aria-label="Fechar">Fechar</button></header><div className="admin-modal-body">{children}</div></div>
  </div>;
}

/** "Marcar como apostado": anexa o comprovante (ou informa o link) e registra as cotas pagas. */
export function RegisterBetDialog({ pool, shares, onClose, onDone, notify }: { pool: Rec; shares?: Rec[]; onClose: () => void; onDone: () => void; notify: Notify }) {
  const [count, setCount] = useState(0);
  const [link, setLink] = useState('');
  const [ticket, setTicket] = useState('');
  const [busy, setBusy] = useState(false);
  const alreadyDone = pool.status === 'registrado';
  const ready = count > 0 || link.trim().length > 0;
  async function confirm() {
    setBusy(true);
    try {
      await api(`/api/v1/admin/operacao/boloes/${pool.id}/comprovante`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(link.trim() ? { comprovanteUrl: link.trim() } : {}), ...(ticket.trim() ? { codigoBilhete: ticket.trim() } : {}) }) });
      notify('success', 'Aposta marcada como feita. As cotas pagas foram registradas.');
      onDone(); onClose();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  const name = `${modalityNames[pool.modalidade] ?? pool.modalidade ?? 'Bolão'} #${pool.concurso ?? ''}`;
  return <AdminModal title={`Comprovantes · ${name}`} onClose={onClose}>
    <p className="admin-help">Envie a foto ou o PDF do comprovante que a lotérica entregou, com os jogos apostados. Depois confirme abaixo.</p>
    <AttachmentsPanel poolId={pool.id} shares={shares} notify={notify} onChange={setCount} />
    <div className="attach-confirm">
      <h3>{alreadyDone ? 'Atualizar dados da aposta' : 'Confirmar que a aposta foi feita'}</h3>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Número do bilhete (opcional)</span><input value={ticket} onChange={(event) => setTicket(event.target.value)} maxLength={80} /></label>
        <label className="admin-field"><span>Link do comprovante, se tiver (opcional)</span><input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" inputMode="url" /></label>
      </div>
      <button type="button" className="admin-button admin-button-primary" disabled={busy || !ready} onClick={() => void confirm()}>{busy ? 'Salvando…' : alreadyDone ? 'Salvar' : 'Aposta feita — registrar cotas'}</button>
      {!ready && <small className="admin-help"> Envie ao menos um arquivo (ou informe o link) para liberar o botão.</small>}
    </div>
  </AdminModal>;
}
