'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, dateTime, Empty, Notify, Panel, Rec, Table } from './admin-ui';

const AUDIENCES: Array<[string, string]> = [
  ['todos', 'Todos os clientes e afiliados'],
  ['cotistas', 'Só clientes (cotistas)'],
  ['afiliados', 'Só afiliados'],
  ['bolao', 'Quem tem cota em um bolão'],
  ['grupo', 'Pessoas de um grupo'],
  ['com_aviso_no_celular', 'Quem ligou os avisos no celular'],
];
const LABEL = Object.fromEntries(AUDIENCES);

/** Mensagens da equipe para os clientes: aviso na conta, aviso no celular (PWA) e, se marcado, e-mail. */
export function ComunicadosView({ notify }: { notify: Notify }) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [history, setHistory] = useState<Rec[]>([]);
  const [devices, setDevices] = useState<{ aparelhos: number; pessoas: number } | null>(null);
  const [pools, setPools] = useState<Rec[]>([]);
  const [groups, setGroups] = useState<Rec[]>([]);
  const [audience, setAudience] = useState('todos');
  const [poolId, setPoolId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('/minha-conta');
  const [email, setEmail] = useState(false);
  const [preview, setPreview] = useState<{ total: number; comAvisoNoCelular: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, poolList, groupList] = await Promise.all([api('/api/v1/admin/comunicados'), api('/api/v1/admin/boloes?page=1&pageSize=50'), api('/api/v1/admin/grupos?page=1&pageSize=100')]);
      setHistory(list.comunicados ?? []); setDevices(list.aparelhos ?? null); setPools(poolList.items ?? []); setGroups(groupList.items ?? []);
    } catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível carregar.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const body = useCallback(() => ({ publico: audience, ...(audience === 'bolao' && poolId ? { bolaoId: poolId } : {}), ...(audience === 'grupo' && groupId ? { grupoId: groupId } : {}) }), [audience, poolId, groupId]);
  useEffect(() => {
    setPreview(null);
    if ((audience === 'bolao' && !poolId) || (audience === 'grupo' && !groupId)) return;
    let cancelled = false;
    api('/api/v1/admin/comunicados/previa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) })
      .then((result) => { if (!cancelled) setPreview(result as never); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [audience, poolId, groupId, body]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview || preview.total === 0) { notify('error', 'Ninguém se encaixa nesse público.'); return; }
    if (!window.confirm(`Enviar para ${preview.total} ${preview.total === 1 ? 'pessoa' : 'pessoas'}${email ? ' (com e-mail)' : ''}?`)) return;
    setBusy(true);
    try {
      const result = await api('/api/v1/admin/comunicados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body(), titulo: title, mensagem: message, link: link || undefined, enviarEmail: email }) });
      notify('success', `Mensagem enviada para ${result.destinatarios} ${result.destinatarios === 1 ? 'pessoa' : 'pessoas'}. Os avisos saem em poucos minutos.`);
      setTitle(''); setMessage(''); await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível enviar.'); }
    finally { setBusy(false); }
  }

  return <>
    <div className="admin-page-heading"><div><span className="admin-eyebrow">Clientes</span><h1>Mensagens para clientes</h1><p>Escreva um aviso e escolha quem recebe. Ele aparece na conta da pessoa e chega no celular de quem ligou os avisos.</p></div></div>
    <div className="admin-mini-stats"><span>Pessoas com aviso no celular <strong>{devices?.pessoas ?? 0}</strong></span><span>Aparelhos <strong>{devices?.aparelhos ?? 0}</strong></span></div>
    <Panel title="Nova mensagem" description="Antes de enviar, o sistema mostra quantas pessoas vão receber.">
      <form className="admin-form-grid" onSubmit={submit}>
        <label className="admin-field"><span>Quem recebe</span><select value={audience} onChange={(event) => setAudience(event.target.value)}>{AUDIENCES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        {audience === 'bolao' && <label className="admin-field"><span>Bolão</span><select value={poolId} onChange={(event) => setPoolId(event.target.value)}><option value="">Escolha…</option>{pools.map((pool) => <option key={pool.id} value={pool.id}>{(pool.grupo?.nome ?? 'Bolão')} · {pool.concurso?.nomeEspecial ? `${pool.concurso.nomeEspecial} · ` : ''}{pool.concurso?.numeroConcurso > 0 ? `concurso ${pool.concurso.numeroConcurso}` : 'concurso a definir'}</option>)}</select></label>}
        {audience === 'grupo' && <label className="admin-field"><span>Grupo</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Escolha…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.nome} ({group.totalMembros ?? 0} pessoas)</option>)}</select></label>}
        <label className="admin-field admin-field-wide"><span>Título (aparece em destaque)</span><input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Seu jogo foi registrado!" /></label>
        <label className="admin-field admin-field-wide"><span>Mensagem</span><textarea required minLength={3} maxLength={600} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ex.: O comprovante do bolão já está na sua conta. Boa sorte!" /><small>{message.length}/600</small></label>
        <label className="admin-field"><span>Abrir esta página ao tocar</span><input value={link} onChange={(event) => setLink(event.target.value)} placeholder="/minha-conta" /></label>
        <label className="admin-toggle-row admin-field-wide"><input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} /><span><strong>Mandar também por e-mail</strong><small>Use com moderação: o serviço de e-mail tem limite diário de envios. Sem marcar, vai só para a conta e o celular.</small></span></label>
        <div className="admin-callout admin-field-wide" role="status">{preview ? <>Vai para <strong>{preview.total}</strong> {preview.total === 1 ? 'pessoa' : 'pessoas'}; <strong>{preview.comAvisoNoCelular}</strong> {preview.comAvisoNoCelular === 1 ? 'tem' : 'têm'} o aviso no celular ligado. Os demais veem na conta{email ? ' e recebem o e-mail' : ''}.</> : 'Escolha o público para ver quantas pessoas recebem.'}</div>
        <div className="wizard-actions admin-field-wide"><button className="admin-button admin-button-primary" disabled={busy || !preview || preview.total === 0}>{busy ? 'Enviando…' : 'Enviar mensagem'}</button></div>
      </form>
    </Panel>
    <Panel title="Mensagens enviadas">
      {history.length ? <Table minWidth={760}><thead><tr><th>Quando</th><th>Título</th><th>Para</th><th>Pessoas</th><th>E-mail</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><strong>{item.titulo}</strong><small>{item.mensagem}</small></td><td>{LABEL[item.publico] ?? item.publico}</td><td>{item.totalDestinatarios}</td><td>{item.enviarEmail ? 'Sim' : 'Não'}</td></tr>)}</tbody></Table> : <Empty text="Nenhuma mensagem enviada ainda." />}
    </Panel>
  </>;
}
