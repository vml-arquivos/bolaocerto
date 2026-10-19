'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { shortDate } from '../lib/domain';
import { authenticatedFetch } from '../lib/client-api';
import { ATTACHMENT_LABELS, fileSize } from '../lib/files';
import { OpenFileButton } from './open-file-button';
import { modalityNames } from '../lib/domain';

type Notice = { id: string; titulo: string; mensagem: string; link: string | null; lida: boolean; criadoEm: string };

function messageOf(data: { message?: string | string[] }, fallback: string) {
  return Array.isArray(data.message) ? data.message.join(' ') : data.message || fallback;
}

export function NotificationsCard() {
  const [items, setItems] = useState<Notice[] | null>(null);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/v1/notificacoes');
      if (!response.ok) { setItems([]); return; }
      const data = await response.json() as { items: Notice[]; naoLidas: number };
      setItems(data.items); setUnread(data.naoLidas);
    } catch { setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function readOne(id: string) {
    await authenticatedFetch(`/api/v1/notificacoes/${id}/lida`, { method: 'POST' }).catch(() => undefined);
    void load();
  }
  async function readAll() {
    await authenticatedFetch('/api/v1/notificacoes/lidas', { method: 'POST' }).catch(() => undefined);
    void load();
  }
  if (!items || items.length === 0) return null;
  return <article className="dashboard-card wide notices-card" aria-labelledby="avisos-titulo">
    <div className="card-heading"><h2 id="avisos-titulo">Avisos{unread > 0 && <span className="badge-count" aria-label={`${unread} não lidos`}>{unread}</span>}</h2>{unread > 0 && <button type="button" className="text-link" onClick={() => void readAll()}>Marcar todos como lidos</button>}</div>
    <ul className="notice-list">{items.slice(0, 8).map((item) => <li key={item.id} className={item.lida ? 'is-read' : 'is-unread'}>
      <div><strong>{item.titulo}</strong><p>{item.mensagem}</p><small className="muted">{shortDate(item.criadoEm)}</small></div>
      <div className="notice-actions">{item.link && <Link className="text-link" href={item.link} onClick={() => !item.lida && void readOne(item.id)}>Abrir</Link>}{!item.lida && <button type="button" className="text-link" onClick={() => void readOne(item.id)}>Marcar como lido</button>}</div>
    </li>)}</ul>
  </article>;
}

export function PasswordCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setOk(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const novaSenha = String(form.get('novaSenha') ?? '');
    if (novaSenha !== String(form.get('confirmacao') ?? '')) { setMessage('As duas senhas novas precisam ser iguais.'); return; }
    setBusy(true);
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senhaAtual: String(form.get('senhaAtual') ?? ''), novaSenha }) });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(messageOf(data, 'Não foi possível alterar a senha.'));
      formElement.reset(); setOk(true); setMessage('Senha alterada com sucesso.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  return <article className="dashboard-card wide"><h2>Segurança</h2>
    <p className="muted">Troque a senha com regularidade e não a repita em outros serviços.</p>
    <form onSubmit={submit} className="admin-form-grid">
      <div className="field"><label htmlFor="senhaAtual">Senha atual</label><input id="senhaAtual" name="senhaAtual" type="password" required autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="novaSenhaConta">Nova senha (mín. 12)</label><input id="novaSenhaConta" name="novaSenha" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></div>
      <div className="field"><label htmlFor="confirmacaoConta">Repita a nova senha</label><input id="confirmacaoConta" name="confirmacao" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></div>
      <div className="field" style={{ alignSelf: 'end' }}><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Alterar senha'}</button></div>
    </form>
    {message && <div className={`form-message ${ok ? 'form-success' : 'form-error'}`} role={ok ? 'status' : 'alert'}>{message}</div>}
  </article>;
}

export function PrivacyCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  async function download() {
    setBusy(true); setMessage(''); setOk(false);
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/dados');
      if (!response.ok) throw new Error('Não foi possível gerar o arquivo agora.');
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'meus-dados-bl.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setOk(true); setMessage('Arquivo baixado.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setOk(false);
    const motivo = String(new FormData(event.currentTarget).get('motivo') ?? '').trim();
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/exclusao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(motivo ? { motivo } : {}) });
      const data = await response.json().catch(() => ({})) as { message?: string | string[]; mensagem?: string };
      if (!response.ok) throw new Error(messageOf(data, 'Não foi possível registrar o pedido.'));
      setOk(true); setAskDelete(false); setMessage(data.mensagem || 'Pedido registrado.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  return <article className="dashboard-card wide"><h2>Privacidade e dados (LGPD)</h2>
    <p className="muted">Você pode baixar uma cópia dos seus dados ou pedir a exclusão da conta. Dados fiscais e de pagamento são mantidos pelo prazo exigido em lei. Veja a <Link className="text-link" href="/privacidade">política de privacidade</Link>.</p>
    <div className="action-row">
      <button type="button" className="button button-ghost" onClick={() => void download()} disabled={busy}>Baixar meus dados</button>
      {!askDelete && <button type="button" className="button button-ghost" onClick={() => setAskDelete(true)} disabled={busy}>Solicitar exclusão da conta</button>}
    </div>
    {askDelete && <form onSubmit={requestDeletion} className="delete-form">
      <div className="field"><label htmlFor="motivo">Quer contar o motivo? (opcional)</label><textarea id="motivo" name="motivo" maxLength={500} rows={3} /></div>
      <p className="muted">Cotas em andamento são mantidas até a apuração do concurso. Nossa equipe analisa o pedido e entra em contato.</p>
      <div className="action-row"><button className="button button-primary" disabled={busy}>{busy ? 'Enviando…' : 'Confirmar pedido de exclusão'}</button><button type="button" className="button button-ghost" onClick={() => setAskDelete(false)}>Cancelar</button></div>
    </form>}
    {message && <div className={`form-message ${ok ? 'form-success' : 'form-error'}`} role={ok ? 'status' : 'alert'}>{message}</div>}
  </article>;
}

/** Verificação em duas etapas (aplicativo autenticador) e "sair de todos os dispositivos". */
export function TwoFactorCard({ role }: { role?: string }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const privileged = role === 'admin' || role === 'operacao';

  const load = useCallback(async () => {
    try { const response = await authenticatedFetch('/api/v1/auth/me'); if (response.ok) setActive(Boolean((await response.json() as { totpAtivo?: boolean }).totpAtivo)); } catch { setActive(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(path: string, body?: unknown) {
    const response = await authenticatedFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown> & { message?: string | string[] };
    if (!response.ok) throw new Error(messageOf(data, 'Não foi possível concluir.'));
    return data;
  }
  async function start() {
    setBusy(true); setMessage(''); setOk(false);
    try {
      const data = await call('/api/v1/auth/2fa/iniciar') as { secret: string; otpauthUrl: string };
      setSetup({ ...data, qr: await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 192 }) });
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const data = await call('/api/v1/auth/2fa/ativar', { codigo: String(new FormData(event.currentTarget).get('codigo') ?? '').trim() }) as { codigosRecuperacao: string[] };
      setCodes(data.codigosRecuperacao); setSetup(null); setActive(true); setOk(true); setMessage('Verificação em duas etapas ativada.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setOk(false);
    const form = new FormData(event.currentTarget);
    try {
      await call('/api/v1/auth/2fa/desativar', { senha: String(form.get('senha') ?? ''), codigo: String(form.get('codigo') ?? '').trim() });
      setActive(false); setDisabling(false); setOk(true); setMessage('Verificação em duas etapas desativada.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  async function logoutAll() {
    if (!window.confirm('Encerrar a sessão em TODOS os aparelhos, inclusive neste?')) return;
    setBusy(true);
    try { await call('/api/v1/auth/logout-todos'); window.location.href = '/login'; } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); setBusy(false); }
  }

  return <article className="dashboard-card wide"><h2>Verificação em duas etapas</h2>
    <p className="muted">Além da senha, pede um código de 6 dígitos de um aplicativo (Google Authenticator, Authy, 1Password…). {privileged ? <strong>Recomendado para contas administrativas.</strong> : 'Protege a sua conta mesmo que a senha vaze.'}</p>
    {active === false && !setup && <div className="action-row"><button type="button" className="button button-primary" onClick={() => void start()} disabled={busy}>Ativar verificação em duas etapas</button></div>}
    {setup && <form onSubmit={confirm} className="twofa-setup">
      <ol className="muted">
        <li>Abra o aplicativo autenticador e escolha “adicionar conta”.</li>
        <li>Leia o QR code abaixo (ou digite a chave manualmente).</li>
        <li>Digite o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>
      <div className="twofa-qr"><img src={setup.qr} alt="QR code para o aplicativo autenticador" width={192} height={192} /><div><small className="muted">Chave manual</small><code className="twofa-secret">{setup.secret}</code></div></div>
      <div className="field"><label htmlFor="codigo2fa">Código de 6 dígitos</label><input id="codigo2fa" name="codigo" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={8} required /></div>
      <div className="action-row"><button className="button button-primary" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar e ativar'}</button><button type="button" className="button button-ghost" onClick={() => setSetup(null)}>Cancelar</button></div>
    </form>}
    {codes && <div className="notice"><strong>Guarde estes códigos de recuperação</strong><span>Cada um funciona uma única vez, caso você perca o celular. Eles não serão mostrados de novo.</span><div className="recovery-codes">{codes.map((code) => <code key={code}>{code}</code>)}</div><button type="button" className="text-link" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>Copiar códigos</button></div>}
    {active && !disabling && !codes && <div className="action-row"><span className="tag tag-open">Ativa</span><button type="button" className="button button-ghost" onClick={() => setDisabling(true)} disabled={busy}>Desativar</button></div>}
    {active && disabling && <form onSubmit={disable} className="delete-form">
      <div className="field"><label htmlFor="senha2fa">Sua senha</label><input id="senha2fa" name="senha" type="password" required autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="cod2fa">Código do aplicativo (ou de recuperação)</label><input id="cod2fa" name="codigo" required minLength={6} maxLength={20} autoComplete="one-time-code" /></div>
      <div className="action-row"><button className="button button-primary" disabled={busy}>Desativar</button><button type="button" className="button button-ghost" onClick={() => setDisabling(false)}>Cancelar</button></div>
    </form>}
    {message && <div className={`form-message ${ok ? 'form-success' : 'form-error'}`} role={ok ? 'status' : 'alert'}>{message}</div>}
    <hr className="soft-divider" />
    <div className="action-row"><button type="button" className="button button-ghost" onClick={() => void logoutAll()} disabled={busy}>Sair de todos os dispositivos</button><small className="muted">Útil se perdeu um aparelho ou suspeita de acesso indevido.</small></div>
  </article>;
}


type MyFile = { id: string; bolaoId: string; cotaId: string | null; tipo: string; nome: string; tamanho: number; enviadoEm: string; modalidade: string; concurso: number };

/** Comprovantes das apostas e recibos das cotas da pessoa (só ela vê). */
export function ReceiptsCard() {
  const [files, setFiles] = useState<MyFile[] | null>(null);
  useEffect(() => {
    authenticatedFetch('/api/v1/anexos/meus').then(async (response) => setFiles(response.ok ? await response.json() as MyFile[] : [])).catch(() => setFiles([]));
  }, []);
  if (!files || files.length === 0) return null;
  return <article className="dashboard-card wide"><h2>Meus comprovantes</h2>
    <p className="muted">Guarde estes arquivos: são a prova da sua participação. Para resgatar um prêmio, leve o recibo da sua cota à lotérica ou à CAIXA, junto com um documento.</p>
    <ul className="receipt-files">{files.map((file) => <li key={file.id}>
      <div><strong>{ATTACHMENT_LABELS[file.tipo] ?? 'Arquivo'}</strong><small>{modalityNames[file.modalidade] ?? file.modalidade} · concurso {file.concurso} · {file.nome} · {fileSize(file.tamanho)} · {shortDate(file.enviadoEm)}</small></div>
      <OpenFileButton id={file.id} label="Abrir" />
    </li>)}</ul>
  </article>;
}

type PlayStatus = {
  pausada: boolean; pausaPermanente: boolean; pausaAte: string | null;
  limiteMensal: number | null; gastoNoMes: number; restante: number | null;
  limitePendente: { valor: number | null; aplicaEm: string } | null;
};
const reais = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Jogo responsável: limite de gasto por mês e pausa. Diminuir vale na hora; aumentar espera 24 h. */
export function ResponsiblePlayCard() {
  const [status, setStatus] = useState<PlayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const load = useCallback(() => {
    authenticatedFetch('/api/v1/usuarios/me/jogo-responsavel').then(async (response) => setStatus(response.ok ? await response.json() as PlayStatus : null)).catch(() => setStatus(null));
  }, []);
  useEffect(load, [load]);

  async function send(path: string, method: string, body: unknown, done: string) {
    setBusy(true); setMessage(''); setOk(false);
    try {
      const response = await authenticatedFetch(`/api/v1/usuarios/me/jogo-responsavel${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as PlayStatus & { message?: string | string[] };
      if (!response.ok) throw new Error(messageOf(data, 'Não foi possível salvar agora.'));
      setStatus(data); setOk(true); setMessage(done);
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get('valor') ?? '').replace(',', '.').trim();
    if (!raw) { setMessage('Digite o valor do limite.'); setOk(false); return; }
    const valor = Number(raw);
    if (!Number.isFinite(valor) || valor < 10) { setMessage('O limite mínimo é R$ 10,00.'); setOk(false); return; }
    void send('/limite', 'PUT', { valor }, 'Limite salvo.');
  }
  function pause(dias: number) {
    if (window.confirm(`Pausar por ${dias} dias? Durante esse tempo você não poderá comprar cotas, e não dá para encurtar.`)) void send('/pausa', 'POST', { dias }, `Pausa de ${dias} dias ativada.`);
  }
  function pauseForever() {
    if (window.confirm('Pausar por tempo indeterminado? Só o suporte pode reativar sua conta para compras.')) void send('/pausa', 'POST', { permanente: true }, 'Pausa ativada.');
  }

  if (!status) return null;
  const pendingText = status.limitePendente
    ? status.limitePendente.valor === null ? 'Remover o limite' : `Novo limite de ${reais(status.limitePendente.valor)}`
    : '';
  return <article className="dashboard-card wide"><h2>Jogo responsável</h2>
    {status.pausada && <div className="form-message form-error" role="status">{status.pausaPermanente ? 'Sua participação está pausada por tempo indeterminado. Fale com o suporte para voltar.' : `Sua participação está pausada até ${status.pausaAte ? shortDate(status.pausaAte) : ''}.`}</div>}
    <p className="muted">{status.limiteMensal === null ? 'Você não definiu limite de gasto por mês.' : <>Limite do mês: <strong>{reais(status.limiteMensal)}</strong> · usado {reais(status.gastoNoMes)} · ainda pode usar <strong>{reais(status.restante ?? 0)}</strong></>}</p>
    {status.limitePendente && <p className="muted">{pendingText} vale a partir de {new Date(status.limitePendente.aplicaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Até lá, vale o limite atual.</p>}
    <form onSubmit={saveLimit} className="admin-form-grid">
      <div className="field"><label htmlFor="limiteMensal">Limite por mês (R$)</label><input id="limiteMensal" name="valor" inputMode="decimal" placeholder="Ex.: 300" /></div>
      <div className="field" style={{ alignSelf: 'end', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="button button-primary" disabled={busy}>Salvar limite</button>
        {status.limiteMensal !== null && <button type="button" className="button button-secondary" disabled={busy} onClick={() => send('/limite', 'PUT', { valor: null }, 'Pedido enviado.')}>Tirar limite</button>}
      </div>
    </form>
    <p className="muted">Baixar o limite vale na hora. Subir ou tirar o limite só vale depois de 24 horas.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {[30, 60, 90].map((dias) => <button key={dias} type="button" className="button button-secondary" disabled={busy} onClick={() => pause(dias)}>Pausar {dias} dias</button>)}
      <button type="button" className="button button-secondary" disabled={busy} onClick={pauseForever}>Pausar sem prazo</button>
    </div>
    <p className="muted"><Link href="/jogo-responsavel">Ajuda e telefones de apoio</Link></p>
    {message && <div className={`form-message ${ok ? 'form-success' : 'form-error'}`} role={ok ? 'status' : 'alert'}>{message}</div>}
  </article>;
}
