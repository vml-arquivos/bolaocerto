'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { modalityNames, money, shortDate } from '../lib/domain';
import { authenticatedFetch } from '../lib/client-api';
import { PaymentInstructions, PaymentView } from './payment-instructions';
import { ReceiptPanel } from './receipt-panel';
import { PushToggle } from './push-toggle';
import { ModalityAlertsCard } from './modality-alerts-card';
import { ProfilePanel } from './profile-panel';
import { NotificationsCard, PasswordCard, PrivacyCard, ReceiptsCard, ResponsiblePlayCard, TwoFactorCard } from './account-extras';
import { concursoNo } from '../lib/contest';
import { brl, ReferralTab, WalletData, WalletTab } from './account-wallet';

type User = { id: string; nome: string; email: string; papel: string; statusKyc: string };
type Share = {
  id: string; bolaoId: string; titularNome: string; status: string; quantidade: number; valorPago: string | null; valorTotal?: string;
  comprovanteIndividualUrl: string | null; valorPremio?: string | null; faixaPremio?: string | null; expiraReservaEm?: string | null; criadoEm?: string; origemVenda?: string;
  bolao?: { id: string; status: string; grupo: string; valorCota: string; modalidade: string; numeroConcurso: number; dataSorteio: string; teveGanhador: boolean; jogos: Array<{ ordem: number; numeros: number[] }> };
  pagamento?: (PaymentView & { id: string; notaFiscal?: { status: string; numero: string | null; pdfUrl: string | null } | null }) | null;
};
type Perfil = { telefone: string | null; chavePix: string | null };
type Address = { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; completo: boolean; nfseAtiva: boolean };
const NOTE_TEXT: Record<string, string> = { aguardando: 'em processamento', aguardando_certificado: 'em processamento', emitida: 'emitida', erro: 'em análise' };

const PAID = ['paga', 'registrada', 'apurada', 'premiada'];
const STATUS_TEXT: Record<string, string> = { reservada: 'Aguardando pagamento', paga: 'Paga', registrada: 'Registrada na loteria', apurada: 'Apurada', premiada: 'Premiada', cancelada: 'Cancelada', estornada: 'Estornada' };


const TONE: Record<string, string> = { reservada: 'warn', paga: 'ok', registrada: 'ok', apurada: 'ok', premiada: 'gold', cancelada: 'muted', estornada: 'muted' };

function ShareCard({ share, onPaid }: { share: Share; onPaid: () => void }) {
  const [showPayment, setShowPayment] = useState(false);
  const expired = share.status === 'reservada' && share.expiraReservaEm ? new Date(share.expiraReservaEm) < new Date() : false;
  const pending = share.status === 'reservada' && !expired && share.pagamento && share.pagamento.status === 'pendente';
  const title = share.bolao ? `${modalityNames[share.bolao.modalidade] ?? share.bolao.modalidade} · concurso ${concursoNo(share.bolao.numeroConcurso)}` : `Bolão ${share.bolaoId.slice(0, 8)}`;
  const label = expired ? 'Reserva expirada' : STATUS_TEXT[share.status] ?? share.status;
  return <article className="cota-card">
    <header><div><strong>{title}</strong><small>{share.bolao ? `Sorteio ${shortDate(share.bolao.dataSorteio)} · ${share.bolao.grupo}` : ''}</small></div><span className={`cota-status is-${expired ? 'muted' : TONE[share.status] ?? 'muted'}`}>{label}</span></header>
    <div className="cota-meta"><span>{share.quantidade} {share.quantidade === 1 ? 'cota' : 'cotas'}</span><strong>{money(share.valorPago ?? share.valorTotal)}</strong></div>
    {share.status === 'premiada' && <div className="form-message form-success">Cota premiada{share.faixaPremio ? ` (${share.faixaPremio})` : ''}: {money(share.valorPremio)}. Resgate com o comprovante individual vinculado ao seu CPF.</div>}
    <div className="cota-actions">
      {pending && share.pagamento && <button type="button" className="button button-primary" onClick={() => setShowPayment((value) => !value)}>{showPayment ? 'Ocultar pagamento' : share.pagamento.metodo === 'boleto' ? 'Ver boleto / Pix' : 'Pagar com Pix'}</button>}
      <Link className="button button-secondary" href={`/boloes/${share.bolaoId}`}>Ver bolão</Link>
      {share.comprovanteIndividualUrl && <a className="button button-secondary" href={share.comprovanteIndividualUrl} target="_blank" rel="noreferrer">Comprovante</a>}
    </div>
    {pending && share.pagamento && showPayment && <div className="cota-payment"><PaymentInstructions shareId={share.id} payment={share.pagamento} onPaid={onPaid} /></div>}
    {share.status === 'reservada' && !share.pagamento && !expired && <small className="muted">Reserva sem cobrança. Abra o bolão para gerar o pagamento antes do prazo{share.expiraReservaEm ? ` (${shortDate(share.expiraReservaEm)})` : ''}.</small>}
    <details className="cota-more"><summary>Detalhes</summary>
      <div className="cota-more-body">
        <small>Titular: {share.titularNome} · cota {share.id.slice(0, 8)}</small>
        {share.bolao && share.bolao.jogos.length > 0 && <div><strong>Jogos ({share.bolao.jogos.length})</strong><ul>{share.bolao.jogos.map((game) => <li key={game.ordem}><small>Jogo {game.ordem}:</small> <code>{game.numeros.map((n) => String(n).padStart(2, '0')).join(' ')}</code></li>)}</ul></div>}
        {share.pagamento?.notaFiscal && <small className="muted">Nota fiscal de serviço: {NOTE_TEXT[share.pagamento.notaFiscal.status] ?? share.pagamento.notaFiscal.status}{share.pagamento.notaFiscal.numero ? ` · nº ${share.pagamento.notaFiscal.numero}` : ''} {share.pagamento.notaFiscal.pdfUrl && <a className="text-link" href={share.pagamento.notaFiscal.pdfUrl} target="_blank" rel="noreferrer">Baixar PDF</a>}</small>}
        {share.pagamento?.status === 'confirmado' && <ReceiptPanel shareId={share.id} />}
      </div>
    </details>
  </article>;
}

function AddressCard({ address, onSaved }: { address: Address; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].map((key) => [key, String(form.get(key) ?? '').trim()]).filter(([, value]) => value));
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/endereco', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((Array.isArray(data.message) ? data.message.join(' ') : data.message) || 'Não foi possível salvar o endereço.');
      setMessage(address.nfseAtiva ? 'Endereço salvo. Sua nota fiscal será emitida automaticamente.' : 'Endereço salvo.'); onSaved();
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setSaving(false); }
  }
  return <article className="dashboard-card wide keep-title"><h2>{address.nfseAtiva ? 'Endereço para nota fiscal' : 'Meu endereço'}</h2>
    <p className="muted">{address.completo ? 'Seu endereço está completo. Você pode atualizá-lo aqui.' : address.nfseAtiva ? 'Informe seu endereço para receber a nota fiscal de serviço das suas participações.' : 'Mantenha seu endereço completo. Ele fica salvo na sua conta e será usado se for preciso emitir documentos.'}</p>
    <form onSubmit={submit} className="admin-form-grid">
      <div className="field"><label htmlFor="end-cep">CEP</label><input id="end-cep" name="cep" inputMode="numeric" maxLength={9} defaultValue={address.cep ?? ''} required /></div>
      <div className="field"><label htmlFor="end-logradouro">Rua / logradouro</label><input id="end-logradouro" name="logradouro" defaultValue={address.logradouro ?? ''} required /></div>
      <div className="field"><label htmlFor="end-numero">Número</label><input id="end-numero" name="numero" defaultValue={address.numero ?? ''} required /></div>
      <div className="field"><label htmlFor="end-complemento">Complemento</label><input id="end-complemento" name="complemento" defaultValue={address.complemento ?? ''} /></div>
      <div className="field"><label htmlFor="end-bairro">Bairro</label><input id="end-bairro" name="bairro" defaultValue={address.bairro ?? ''} required /></div>
      <div className="field"><label htmlFor="end-cidade">Cidade</label><input id="end-cidade" name="cidade" defaultValue={address.cidade ?? ''} required /></div>
      <div className="field"><label htmlFor="end-uf">UF</label><input id="end-uf" name="uf" maxLength={2} defaultValue={address.uf ?? ''} required /></div>
      <div className="field" style={{ alignSelf: 'end' }}><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar endereço'}</button></div>
    </form>
    {message && <div className={`form-message ${message.startsWith('Endereço salvo') ? 'form-success' : 'form-error'}`}>{message}</div>}
  </article>;
}

/** Lista do que falta para o cadastro ficar completo (telefone, Pix e endereço). */
function ProfileChecklist({ perfil, address, onComplete }: { perfil: Perfil | null; address: Address | null; onComplete: () => void }) {
  if (!perfil) return null;
  const items = [
    { label: 'Nome, CPF e e-mail', done: true },
    { label: 'Telefone com DDD', done: Boolean(perfil.telefone) },
    { label: 'Chave Pix (para receber prêmios e reembolsos)', done: Boolean(perfil.chavePix) },
    ...(address ? [{ label: 'Endereço', done: address.completo }] : []),
  ];
  const done = items.filter((item) => item.done).length;
  const pct = Math.round((done / items.length) * 100);
  return <div className="profile-check" role="status">
    <strong>{pct === 100 ? 'Cadastro completo' : `Cadastro ${pct}% completo`}</strong>
    <div className="profile-check-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
    <ul>{items.map((item) => <li key={item.label} className={item.done ? 'is-done' : 'is-todo'}><span aria-hidden="true">{item.done ? '✓' : '!'}</span>{item.label}</li>)}</ul>
    {pct < 100 && <button type="button" className="button button-secondary" onClick={onComplete}>Completar agora</button>}
  </div>;
}

const ICONS: Record<string, string> = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 9a2 2 0 0 0 4 0',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z',
  doc: 'M7 3h7l4 4v14H7V3Zm7 0v4h4M9 12h6m-6 4h6',
};
function Icon({ name }: { name: string }) {
  return <svg className="app-row-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] ?? ICONS.doc} /></svg>;
}
function Row({ title, icon, children, open = false }: { title: string; icon: string; children: React.ReactNode; open?: boolean }) {
  return <details className="app-row" open={open}><summary><Icon name={icon} /><span>{title}</span><span className="app-row-chevron" aria-hidden="true">›</span></summary><div className="app-row-body">{children}</div></details>;
}

export function AccountDashboard() {
  const params = useSearchParams();
  type Tab = 'cotas' | 'carteira' | 'indicar' | 'conta';
  const asTab = (value: string | null): Tab => (value === 'conta' || value === 'carteira' || value === 'indicar' ? value : 'cotas');
  const [tab, setTab] = useState<Tab>(asTab(params.get('aba')));
  const abaParam = params.get('aba');
  useEffect(() => { setTab(asTab(abaParam)); }, [abaParam]);
  function selectTab(next: Tab) {
    setTab(next);
    try { const url = new URL(window.location.href); if (next !== 'cotas') url.searchParams.set('aba', next); else url.searchParams.delete('aba'); window.history.replaceState(null, '', url); } catch { /* sem histórico */ }
  }
  const [dataNonce, setDataNonce] = useState(0);
  function openMyData() { setDataNonce((value) => value + 1); selectTab('conta'); }
  const [user, setUser] = useState<User | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const inFlight = useRef(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [meResponse, sharesResponse] = await Promise.all([authenticatedFetch('/api/v1/auth/me'), authenticatedFetch('/api/v1/cotas/minhas')]);
      if (meResponse.status === 401) { window.location.href = '/login'; return; }
      if (!meResponse.ok || !sharesResponse.ok) throw new Error('Não foi possível carregar sua conta.');
      setUser(await meResponse.json()); setShares(await sharesResponse.json()); setError(''); setUpdatedAt(new Date());
      try { const addressResponse = await authenticatedFetch('/api/v1/usuarios/me/endereco'); setAddress(addressResponse.ok ? await addressResponse.json() : null); } catch { setAddress(null); }
      try { const walletResponse = await authenticatedFetch('/api/v1/usuarios/me/carteira', { cache: 'no-store' }); setWallet(walletResponse.ok ? await walletResponse.json() as WalletData : null); } catch { setWallet(null); }
      try { const profileResponse = await authenticatedFetch('/api/v1/usuarios/me/perfil', { cache: 'no-store' }); setPerfil(profileResponse.ok ? await profileResponse.json() as Perfil : null); } catch { setPerfil(null); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Falha ao carregar.'); } finally { setLoading(false); inFlight.current = false; }
  }, []);
  useEffect(() => { void load();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); };
  }, [load]);

  async function logout() { await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }); window.location.href = '/'; }
  if (loading) return <div className="empty-state"><span>BL</span><h3>Carregando sua conta…</h3></div>;
  if (error && !user) return <div className="notice notice-error"><strong>Não foi possível abrir sua conta</strong><span>{error}</span></div>;

  const paidShares = shares.filter((item) => PAID.includes(item.status));
  const spent = paidShares.reduce((sum, item) => sum + Number(item.valorPago ?? 0), 0);
  const awaiting = shares.filter((item) => item.status === 'reservada' && !(item.expiraReservaEm && new Date(item.expiraReservaEm) < new Date())).length;
  const prizes = shares.filter((item) => item.status === 'premiada').reduce((sum, item) => sum + Number(item.valorPremio ?? 0), 0);

  const isStaff = user?.papel !== undefined && user.papel !== 'cotista';
  return <div className="account-app">
    <header className="account-top">
      <div><small>Área do cotista</small><h1>Olá, {user?.nome?.split(' ')[0]}</h1></div>
      <div className="account-top-actions">{user?.papel === 'admin' && <Link className="button button-secondary" href="/admin">Administração</Link>}{user?.papel === 'afiliado' && <Link className="button button-secondary" href="/afiliado">Painel do afiliado</Link>}<button type="button" className="button button-ghost" onClick={() => void logout()}>Sair</button></div>
    </header>
    {error && <p className="notice" role="status">{error} Os dados abaixo são da última consulta concluída.</p>}
    <div className="account-stats is-four" aria-label="Resumo">
      <div><small>Investido</small><strong>{money(spent)}</strong></div>
      <div><small>A pagar</small><strong>{awaiting}</strong></div>
      <div><small>Prêmios</small><strong>{money(prizes)}</strong></div>
      <div><small>Saldo na carteira</small><strong>{wallet ? brl(wallet.saldoCentavos) : '—'}</strong></div>
    </div>
    <div className="account-tabs is-four" role="tablist" aria-label="Seções da conta">
      <button type="button" role="tab" aria-selected={tab === 'cotas'} className={tab === 'cotas' ? 'is-on' : ''} onClick={() => selectTab('cotas')}>Minhas cotas</button>
      <button type="button" role="tab" aria-selected={tab === 'carteira'} className={tab === 'carteira' ? 'is-on' : ''} onClick={() => selectTab('carteira')}>Carteira</button>
      <button type="button" role="tab" aria-selected={tab === 'indicar'} className={tab === 'indicar' ? 'is-on' : ''} onClick={() => selectTab('indicar')}>Indicar amigos</button>
      <button type="button" role="tab" aria-selected={tab === 'conta'} className={tab === 'conta' ? 'is-on' : ''} onClick={() => selectTab('conta')}>Minha conta</button>
    </div>
    {tab === 'cotas' ? <div className="account-section">
      <NotificationsCard />
      {shares.length ? <div className="cota-list">{shares.map((share) => <ShareCard key={share.id} share={share} onPaid={() => void load()} />)}</div>
        : <div className="empty-state compact"><h3>Você ainda não tem cotas</h3><p>Escolha um bolão e participe em poucos toques.</p><Link className="button button-primary" href="/aplicativo">Ver bolões</Link></div>}
      <p className="account-updated">{updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
    </div> : tab === 'carteira' ? <WalletTab wallet={wallet} />
    : tab === 'indicar' ? <ReferralTab pixMissing={perfil !== null && !perfil.chavePix} onOpenData={openMyData} />
    : <div className="account-section app-rows">
      <ProfileChecklist perfil={perfil} address={address} onComplete={openMyData} />
      <Row key={dataNonce} title="Meus dados" icon="user" open={dataNonce > 0}>
        <ProfilePanel showPix showPhoto={isStaff} pixLabel="Chave Pix (para receber prêmios e reembolsos)" onSaved={() => void load()} />
        {address && <AddressCard address={address} onSaved={() => void load()} />}
      </Row>
      <Row title="Minha carteira" icon="receipt"><p className="muted">Saldo de {wallet ? brl(wallet.saldoCentavos) : '—'}.</p><button type="button" className="button button-secondary" onClick={() => selectTab('carteira')}>Abrir carteira e extrato</button></Row>
      <Row title="Avisos no celular" icon="bell"><PushToggle /></Row>
      <Row title="Avise-me de novos bolões" icon="bell"><ModalityAlertsCard /></Row>
      <Row title="Limite de gastos" icon="gauge"><ResponsiblePlayCard /></Row>
      <Row title="Comprovantes" icon="receipt"><ReceiptsCard /></Row>
      <Row title="Alterar senha" icon="lock" open={params.get('abrir') === 'senha'}><PasswordCard /></Row>
      {isStaff && <Row title="Verificação em duas etapas" icon="shield"><TwoFactorCard role={user?.papel} /></Row>}
      <Link className="app-row-link" href="/minha-conta/contratos"><Icon name="doc" /><span>Contratos e aceites</span><span aria-hidden="true">›</span></Link>
      <Row title="Privacidade e dados" icon="shield"><PrivacyCard /></Row>
    </div>}
  </div>;
}
