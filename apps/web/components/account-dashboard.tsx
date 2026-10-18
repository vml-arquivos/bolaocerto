'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { modalityNames, money, shortDate } from '../lib/domain';
import { authenticatedFetch } from '../lib/client-api';
import { PaymentInstructions, PaymentView } from './payment-instructions';
import { ReceiptPanel } from './receipt-panel';
import { NotificationsCard, PasswordCard, PrivacyCard } from './account-extras';

type User = { id: string; nome: string; email: string; papel: string; statusKyc: string };
type Share = {
  id: string; bolaoId: string; titularNome: string; status: string; quantidade: number; valorPago: string | null; valorTotal?: string;
  comprovanteIndividualUrl: string | null; valorPremio?: string | null; faixaPremio?: string | null; expiraReservaEm?: string | null; criadoEm?: string; origemVenda?: string;
  bolao?: { id: string; status: string; grupo: string; valorCota: string; modalidade: string; numeroConcurso: number; dataSorteio: string; teveGanhador: boolean; jogos: Array<{ ordem: number; numeros: number[] }> };
  pagamento?: (PaymentView & { id: string; notaFiscal?: { status: string; numero: string | null; pdfUrl: string | null } | null }) | null;
};
type Address = { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; completo: boolean; nfseAtiva: boolean };
const NOTE_TEXT: Record<string, string> = { aguardando: 'em processamento', aguardando_certificado: 'em processamento', emitida: 'emitida', erro: 'em análise' };

const PAID = ['paga', 'registrada', 'apurada', 'premiada'];
const STATUS_TEXT: Record<string, string> = { reservada: 'Aguardando pagamento', paga: 'Paga', registrada: 'Registrada na loteria', apurada: 'Apurada', premiada: 'Premiada', cancelada: 'Cancelada', estornada: 'Estornada' };


function ShareCard({ share, onPaid }: { share: Share; onPaid: () => void }) {
  const [showPayment, setShowPayment] = useState(false);
  const expired = share.status === 'reservada' && share.expiraReservaEm ? new Date(share.expiraReservaEm) < new Date() : false;
  const pending = share.status === 'reservada' && !expired && share.pagamento && share.pagamento.status === 'pendente';
  const title = share.bolao ? `${modalityNames[share.bolao.modalidade] ?? share.bolao.modalidade} · concurso ${share.bolao.numeroConcurso}` : `Bolão ${share.bolaoId.slice(0, 8)}`;
  return <div className="share-item share-stack" style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div><strong>{title}</strong><small style={{ display: 'block' }}>{share.bolao ? `Sorteio: ${shortDate(share.bolao.dataSorteio)} · ${share.bolao.grupo}` : ''}</small><small>Titular: {share.titularNome} · cota {share.id.slice(0, 8)}</small></div>
      <div><small>Quantidade</small><strong style={{ display: 'block' }}>{share.quantidade}</strong></div>
      <div><small>{PAID.includes(share.status) ? 'Valor pago' : 'Valor'}</small><strong style={{ display: 'block' }}>{money(share.valorPago ?? share.valorTotal)}</strong></div>
      <div><span className="tag">{expired ? 'Reserva expirada' : STATUS_TEXT[share.status] ?? share.status}</span>{share.comprovanteIndividualUrl && <a className="text-link" style={{ display: 'block' }} href={share.comprovanteIndividualUrl} target="_blank" rel="noreferrer">Comprovante</a>}</div>
    </div>
    {share.bolao && share.bolao.jogos.length > 0 && <details><summary>Ver jogos ({share.bolao.jogos.length})</summary><ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>{share.bolao.jogos.map((game) => <li key={game.ordem}><small>Jogo {game.ordem}:</small> <code>{game.numeros.map((n) => String(n).padStart(2, '0')).join(' ')}</code></li>)}</ul></details>}
    {share.pagamento?.notaFiscal && <small className="muted">Nota fiscal de serviço: {NOTE_TEXT[share.pagamento.notaFiscal.status] ?? share.pagamento.notaFiscal.status}{share.pagamento.notaFiscal.numero ? ` · nº ${share.pagamento.notaFiscal.numero}` : ''} {share.pagamento.notaFiscal.pdfUrl && <a className="text-link" href={share.pagamento.notaFiscal.pdfUrl} target="_blank" rel="noreferrer">Baixar PDF</a>}</small>}
    {share.pagamento?.status === 'confirmado' && <ReceiptPanel shareId={share.id} />}
    {share.status === 'premiada' && <div className="form-message form-success">Cota premiada{share.faixaPremio ? ` (${share.faixaPremio})` : ''}: {money(share.valorPremio)}. Resgate com o comprovante individual vinculado ao seu CPF.</div>}
    {pending && share.pagamento && <div>
      <button type="button" className="button button-secondary" onClick={() => setShowPayment((value) => !value)}>{showPayment ? 'Ocultar pagamento' : share.pagamento.metodo === 'boleto' ? 'Ver boleto / Pix' : 'Pagar com Pix'}</button>
      {showPayment && <div style={{ marginTop: 12 }}><PaymentInstructions shareId={share.id} payment={share.pagamento} onPaid={onPaid} /></div>}
    </div>}
    {share.status === 'reservada' && !share.pagamento && !expired && <small className="muted">Reserva sem cobrança. Abra o bolão para gerar o pagamento antes do prazo{share.expiraReservaEm ? ` (${shortDate(share.expiraReservaEm)})` : ''}.</small>}
  </div>;
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
      setMessage('Endereço salvo. Sua nota fiscal será emitida automaticamente.'); onSaved();
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setSaving(false); }
  }
  return <article className="dashboard-card wide"><h2>Endereço para nota fiscal</h2>
    <p className="muted">{address.completo ? 'Seu endereço está completo. Você pode atualizá-lo aqui.' : 'Informe seu endereço para receber a nota fiscal de serviço das suas participações.'}</p>
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

export function AccountDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [meResponse, sharesResponse] = await Promise.all([authenticatedFetch('/api/v1/auth/me'), authenticatedFetch('/api/v1/cotas/minhas')]);
      if (meResponse.status === 401) { window.location.href = '/login'; return; }
      if (!meResponse.ok || !sharesResponse.ok) throw new Error('Não foi possível carregar sua conta.');
      setUser(await meResponse.json()); setShares(await sharesResponse.json());
      try { const addressResponse = await authenticatedFetch('/api/v1/usuarios/me/endereco'); setAddress(addressResponse.ok ? await addressResponse.json() : null); } catch { setAddress(null); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Falha ao carregar.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function logout() { await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }); window.location.href = '/'; }
  if (loading) return <div className="empty-state"><span>BL</span><h3>Carregando sua conta…</h3></div>;
  if (error) return <div className="notice notice-error"><strong>Não foi possível abrir sua conta</strong><span>{error}</span></div>;

  const paidShares = shares.filter((item) => PAID.includes(item.status));
  const spent = paidShares.reduce((sum, item) => sum + Number(item.valorPago ?? 0), 0);
  const awaiting = shares.filter((item) => item.status === 'reservada' && !(item.expiraReservaEm && new Date(item.expiraReservaEm) < new Date())).length;
  const prizes = shares.filter((item) => item.status === 'premiada').reduce((sum, item) => sum + Number(item.valorPremio ?? 0), 0);

  return <>
    <div className="page-heading"><div><span className="overline">Área do cotista</span><h1>Olá, {user?.nome?.split(' ')[0]}</h1><p className="muted">Acompanhe suas reservas, pagamentos, jogos e comprovantes.</p></div><div className="header-actions">{user?.papel === 'admin' && <Link className="button button-secondary" href="/admin">Administração</Link>}{user?.papel === 'afiliado' && <Link className="button button-secondary" href="/afiliado">Meu workspace</Link>}<button className="button button-ghost" onClick={logout}>Sair</button></div></div>
    <div className="dashboard-grid">
      <article className="dashboard-card"><span className="overline">Total investido</span><strong className="stat-value">{money(spent)}</strong><small className="muted">em {paidShares.reduce((sum, item) => sum + item.quantidade, 0)} cota(s) pagas</small></article>
      <article className="dashboard-card"><span className="overline">Aguardando pagamento</span><strong className="stat-value">{awaiting}</strong><small className="muted">reservas dentro do prazo</small></article>
      <article className="dashboard-card"><span className="overline">Prêmios</span><strong className="stat-value">{money(prizes)}</strong><small className="muted">em cotas premiadas</small></article>
      <article className="dashboard-card"><span className="overline">Verificação</span><strong className="stat-value stat-text">{user?.statusKyc?.replace('_', ' ')}</strong><small className="muted">situação cadastral</small></article>
      {address?.nfseAtiva && paidShares.length > 0 && <AddressCard address={address} onSaved={() => void load()} />}
      <NotificationsCard />
      <article className="dashboard-card wide"><h2>Minhas cotas</h2>
        {shares.length ? <div className="share-list">{shares.map((share) => <ShareCard key={share.id} share={share} onPaid={() => void load()} />)}</div>
          : <div className="empty-state compact"><h3>Você ainda não possui cotas</h3><p>Escolha um bolão disponível para iniciar sua participação.</p><Link className="button button-primary" href="/#boloes">Ver bolões</Link></div>}
      </article>
      <PasswordCard />
      <PrivacyCard />
    </div>
  </>;
}
