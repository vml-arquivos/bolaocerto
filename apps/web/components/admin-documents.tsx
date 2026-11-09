'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, chip, dateTime, Empty, Notify, Panel, Rec, Table } from './admin-ui';

const SOURCE_LABEL: Record<string, string> = { painel: 'Publicado pelo painel', ambiente: 'Variável do servidor', arquivo: 'Arquivo do sistema', minuta: 'Minuta provisória' };
const NEEDS_REACCEPT = new Set(['termos', 'privacidade', 'afiliado']);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Central de documentos: Termos de uso, Política de privacidade (LGPD) e contratos (cliente, afiliado, parceiro, funcionário). */
export function DocumentsView({ notify }: { notify: Notify }) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Rec | null>(null);
  const [text, setText] = useState('');
  const [version, setVersion] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);

  const loadList = useCallback(async () => {
    try { const result = await api('/api/v1/admin/documentos'); setItems(result.documentos ?? []); }
    catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível carregar os documentos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  const loadDetail = useCallback(async (kind: string) => {
    try { const result = await api(`/api/v1/admin/documentos/${kind}`); setDetail(result); setText(''); setVersion(''); setConfirm(false); setShowCurrent(false); }
    catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível abrir o documento.'); }
  }, []);
  useEffect(() => { if (open) void loadDetail(open); else setDetail(null); }, [open, loadDetail]);

  async function publish() {
    if (!open || busy) return;
    setBusy(true);
    try {
      const result = await api(`/api/v1/admin/documentos/${open}/publicar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: text, versao: version.trim() || undefined, confirmo: true }) });
      notifyRef.current('success', `Documento publicado (versão ${result.versao}).`);
      await Promise.all([loadList(), loadDetail(open)]);
    } catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível publicar.'); }
    finally { setBusy(false); }
  }

  async function revert() {
    if (!open || busy) return;
    if (!window.confirm('Voltar ao texto padrão do sistema? O texto publicado deixa de valer (o histórico fica guardado).')) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/documentos/${open}/voltar-ao-padrao`, { method: 'POST' });
      notifyRef.current('success', 'Documento voltou ao texto padrão.');
      await Promise.all([loadList(), loadDetail(open)]);
    } catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível voltar ao texto padrão.'); }
    finally { setBusy(false); }
  }

  const reaccept = open ? NEEDS_REACCEPT.has(open) : false;

  return <>
    <div className="admin-page-heading"><div><h1>Documentos</h1></div></div>
    <Panel title="Documentos do sistema">
      {loading ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div> : items.length === 0 ? <Empty text="Nenhum documento encontrado" /> :
        <Table minWidth={980}><thead><tr><th>Documento</th><th>Para quem</th><th>Versão</th><th>Origem do texto</th><th>Aceites</th><th>Quando a pessoa aceita</th><th /></tr></thead><tbody>
          {items.map((doc) => <tr key={doc.tipo} className={open === doc.tipo ? 'is-selected' : undefined}>
            <td><strong>{doc.titulo}</strong></td>
            <td>{doc.para}</td>
            <td>{doc.versao}</td>
            <td><span className={doc.origem === 'minuta' ? chip('pendente') : chip('confirmado')}>{SOURCE_LABEL[doc.origem] ?? doc.origem}</span></td>
            <td>{doc.aceites === null ? '—' : doc.base ? `${doc.aceites} de ${doc.base}` : doc.aceites}</td>
            <td>{doc.aceite}</td>
            <td><div className="admin-row-actions"><button className="admin-button admin-button-secondary" onClick={() => setOpen(open === doc.tipo ? null : doc.tipo)}>{open === doc.tipo ? 'Fechar' : 'Ver e editar'}</button>{doc.rota && <a className="admin-button admin-button-ghost" href={doc.rota} target="_blank" rel="noreferrer">Página pública</a>}</div></td>
          </tr>)}
        </tbody></Table>}
    </Panel>
    {open && detail && <Panel title={detail.titulo} description={`${detail.para} · versão ${detail.versao} · ${SOURCE_LABEL[detail.origem] ?? detail.origem}`} action={<div className="admin-row-actions"><button className="admin-button admin-button-ghost" onClick={() => download(`${detail.tipo}-${detail.versao}.txt`, detail.texto)}>Baixar .txt</button><button className="admin-button admin-button-ghost" onClick={() => setShowCurrent((v) => !v)}>{showCurrent ? 'Ocultar texto atual' : 'Ver texto atual'}</button></div>}>
      {detail.origem === 'minuta' && <div className="admin-callout"><strong>Minuta provisória</strong><p>Este documento ainda mostra o texto provisório do sistema. Cole abaixo o texto definitivo e publique.</p></div>}
      
      {!detail.aprovado && ['participacao', 'afiliado'].includes(detail.tipo) && <p className="admin-help">Contratação ainda bloqueada: faltam as variáveis de identidade e aprovação do operador no servidor (LEGAL_*). Publicar o texto aqui não libera as vendas sozinho.</p>}
      {showCurrent && <pre className="doc-text-preview">{detail.texto}</pre>}
      <div className="admin-form-grid">
        <label className="admin-field" style={{ gridColumn: '1 / -1' }}><span>Novo texto (substitui o atual)</span><textarea className="doc-text-input" rows={16} value={text} onChange={(event) => setText(event.target.value)} placeholder="Cole aqui o texto completo do documento." /><small>{text.trim().length} caracteres{detail.tipo === 'afiliado' ? ' · o percentual de comissão de cada afiliado é acrescentado ao final automaticamente.' : ''}</small></label>
        <label className="admin-field"><span>Nome da versão (opcional)</span><input value={version} maxLength={40} onChange={(event) => setVersion(event.target.value)} placeholder="ex.: 2026-11-10.1" /></label>
      </div>
      <div className="admin-row-actions" style={{ marginBottom: 12 }}><button className="admin-button admin-button-ghost" onClick={() => setText(detail.texto)}>Usar o texto atual como base</button></div>
      <label className="check-line"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> Revisei o texto.{reaccept ? ' Entendo que as pessoas que já aceitaram vão precisar aceitar de novo.' : ''}</label>
      <div className="admin-row-actions" style={{ marginTop: 12 }}>
        <button className="admin-button admin-button-primary" disabled={busy || !confirm || text.trim().length < 200} onClick={() => void publish()}>{busy ? 'Publicando…' : 'Publicar texto'}</button>
        {detail.origem === 'painel' && <button className="admin-button admin-button-ghost" disabled={busy} onClick={() => void revert()}>Voltar ao texto padrão</button>}
      </div>
      <h3 style={{ marginTop: 24 }}>Histórico de versões</h3>
      {detail.historico?.length ? <Table minWidth={640}><thead><tr><th>Versão</th><th>Publicado em</th><th>Por</th><th>Situação</th><th /></tr></thead><tbody>{detail.historico.map((row: Rec) => <tr key={row.id}><td>{row.versao}</td><td>{dateTime(row.publicadoEm)}</td><td>{row.publicadoPor ?? '—'}</td><td><span className={row.ativo ? chip('confirmado') : chip('')}>{row.ativo ? 'Em vigor' : 'Substituída'}</span></td><td><button className="admin-button admin-button-ghost" onClick={() => { setText(row.texto); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Usar como base</button></td></tr>)}</tbody></Table> : <p className="admin-help">Nenhuma versão foi publicada pelo painel ainda.</p>}
    </Panel>}
  </>;
}
