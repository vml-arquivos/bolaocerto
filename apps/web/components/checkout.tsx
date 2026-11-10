'use client';
import { WhatsappJoin } from './community-link';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../lib/domain';
import { AvisoNaoRegistra } from './aviso-nao-registra';
import { PixQr } from './pix-qr';

type Payment = {
  status: string; metodo?: string; valorBruto?: string; vencimentoEm?: string | null;
  qrCodePix?: string | null; linhaDigitavel?: string | null; boletoUrl?: string | null; checkoutUrl?: string | null;
};
type Summary = { voltar?: string; titulo?: string; quantidade?: number; titular?: string };

const POLL_MS = 4000;
const REDIRECT_SECONDS = 6;
const clock = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Só endereços do próprio site: nunca um link externo vindo da URL. */
function safeBack(value?: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/minha-conta';
}

function readSummary(shareId: string): Summary {
  try { return JSON.parse(window.sessionStorage.getItem(`bl-checkout:${shareId}`) ?? '{}') as Summary; } catch { return {}; }
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  }
  return <div className="checkout-copy">
    <small>{label}</small>
    <code>{value}</code>
    <button type="button" className="button button-primary" onClick={() => void copy()}>{copied ? 'Código copiado!' : 'Copiar código'}</button>
  </div>;
}

function useCountdown(until?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (!until) return null;
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, days: Math.floor(left / 86400) };
}

/** Pagar com o crédito da carteira: só aparece se o saldo cobrir a cota inteira. */
function WalletPay({ shareId, valorBruto, onPaid }: { shareId: string; valorBruto?: string; onPaid: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let off = false;
    void fetch('/api/v1/usuarios/me/carteira', { credentials: 'include', cache: 'no-store' }).then(async (response) => (response.ok ? await response.json() as { saldoCentavos: number } : null)).then((data) => { if (!off && data) setBalance(data.saldoCentavos); }).catch(() => undefined);
    return () => { off = true; };
  }, []);
  const needed = Math.round(Number(valorBruto ?? 0) * 100);
  if (balance === null || balance <= 0 || needed <= 0) return null;
  const covers = balance >= needed;
  async function pay() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/v1/cotas/${shareId}/pagar-com-saldo`, { method: 'POST', credentials: 'include' });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível pagar com o saldo.');
      onPaid();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  return <div className="checkout-wallet">
    <p>Você tem <strong>{money(balance / 100)}</strong> de saldo na carteira.{covers ? '' : ' Para pagar com o saldo, ele precisa cobrir o valor inteiro da cota. Pague com Pix abaixo.'}</p>
    {covers && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void pay()}>{busy ? 'Pagando…' : `Pagar ${money(needed / 100)} com o saldo`}</button>}
    {message && <div className="form-message form-error" role="alert">{message}</div>}
  </div>;
}

/** Página de pagamento: QR Code e código do Pix, boleto ou cartão, confirmação automática e volta ao bolão. */
export function Checkout({ shareId, voltar }: { shareId: string; voltar?: string }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary>({});
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const back = useMemo(() => safeBack(voltar ?? summary.voltar), [voltar, summary.voltar]);
  const confirmedAt = useRef(false);

  useEffect(() => setSummary(readSummary(shareId)), [shareId]);

  const load = useCallback(async () => {
    try {
      let response = await fetch(`/api/v1/cotas/${shareId}/pagamento`, { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) {
        const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refresh.ok) response = await fetch(`/api/v1/cotas/${shareId}/pagamento`, { credentials: 'include', cache: 'no-store' });
      }
      if (response.status === 401) { window.location.href = `/login?next=${encodeURIComponent(`/checkout/${shareId}`)}`; return; }
      if (response.status === 404) { setError('Não encontramos a cobrança desta reserva. Volte ao bolão e reserve novamente.'); return; }
      if (!response.ok) return; // falha passageira: tenta no próximo ciclo
      setPayment(await response.json() as Payment); setError('');
    } catch { /* sem conexão agora: tenta de novo */ }
  }, [shareId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (payment && payment.status !== 'pendente') return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [payment, load]);

  const paid = payment?.status === 'confirmado';
  useEffect(() => {
    if (!paid || confirmedAt.current) return;
    confirmedAt.current = true;
    setRedirectIn(REDIRECT_SECONDS);
  }, [paid]);
  useEffect(() => {
    if (redirectIn === null) return;
    if (redirectIn <= 0) { window.location.assign(back); return; }
    const timer = window.setTimeout(() => setRedirectIn((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [redirectIn, back]);

  const countdown = useCountdown(payment?.status === 'pendente' ? payment?.vencimentoEm : null);
  const method = payment?.metodo;
  const isBoleto = method === 'boleto';
  const isCard = method === 'cartao';
  const failed = payment?.status === 'falhou' || payment?.status === 'estornado';
  const expired = Boolean(countdown && countdown.left === 0 && !isBoleto);

  return <div className="checkout-page">
    <div className="checkout-head">
      <Link className="checkout-back" href={back}>← Voltar ao bolão</Link>
      <span className="overline">Pagamento seguro</span>
      <h1>{paid ? 'Pagamento confirmado' : failed ? 'Cobrança encerrada' : isCard ? 'Pague no cartão' : isBoleto ? 'Pague o boleto' : 'Pague com Pix'}</h1>
      {summary.titulo && <p className="muted">{summary.titulo}{summary.quantidade ? ` · ${summary.quantidade} ${summary.quantidade === 1 ? 'cota' : 'cotas'}` : ''}{summary.titular ? ` · titular ${summary.titular}` : ''}</p>}
    </div>

    <AvisoNaoRegistra compact className="checkout-aviso" />
    {error && <div className="checkout-card checkout-state is-error" role="alert"><strong>{error}</strong><Link className="button button-secondary" href={back}>Voltar ao bolão</Link></div>}
    {!error && !payment && <div className="checkout-card checkout-state" role="status"><span className="checkout-spinner" aria-hidden="true" /><strong>Carregando o seu pagamento…</strong></div>}

    {payment && paid && <div className="checkout-card checkout-state is-success" role="status">
      <span className="checkout-check" aria-hidden="true">✓</span>
      <strong>Pagamento confirmado!</strong>
      <p>Sua cota está garantida{payment.valorBruto ? ` · ${money(payment.valorBruto)}` : ''}. O comprovante do jogo chega para você depois do registro na lotérica.</p>
      <WhatsappJoin />
      <div className="checkout-actions">
        <Link className="button button-primary" href={back}>Voltar ao bolão</Link>
        <Link className="button button-secondary" href="/minha-conta">Ver Minhas Cotas</Link>
      </div>
      {redirectIn !== null && <small className="muted">Voltando ao bolão em {Math.max(redirectIn, 0)}s…</small>}
    </div>}

    {payment && failed && <div className="checkout-card checkout-state is-error" role="alert">
      <strong>Esta cobrança foi encerrada.</strong>
      <p>A reserva não está mais ativa. Volte ao bolão e reserve novamente para participar.</p>
      <Link className="button button-primary" href={back}>Voltar ao bolão</Link>
    </div>}

    {payment && !paid && !failed && <div className="checkout-grid">
      <section className="checkout-card checkout-pay" aria-label="Pagamento">
        {payment.valorBruto && <div className="checkout-amount"><span>Valor a pagar</span><strong>{money(payment.valorBruto)}</strong></div>}
        <WalletPay shareId={shareId} valorBruto={payment.valorBruto} onPaid={() => void load()} />

        {!isCard && payment.qrCodePix && <>
          <div className="checkout-qr"><PixQr payload={payment.qrCodePix} /></div>
          <p className="checkout-hint">{isBoleto ? 'O boleto também tem Pix: leia o QR Code ou copie o código abaixo.' : 'Aponte a câmera do app do seu banco para o QR Code.'}</p>
          <CopyBox label="Pix copia e cola" value={payment.qrCodePix} />
        </>}
        {isBoleto && payment.linhaDigitavel && <CopyBox label="Linha digitável do boleto" value={payment.linhaDigitavel} />}
        {isBoleto && payment.boletoUrl && <a className="button button-secondary" href={payment.boletoUrl} target="_blank" rel="noreferrer">Abrir boleto (PDF)</a>}
        {isCard && payment.checkoutUrl && <>
          <p className="checkout-hint">Você vai pagar na página segura do Mercado Pago, com cartão de crédito ou débito. O número do cartão não passa pelo Bolão Livre. Ao terminar, você volta para esta tela.</p>
          <a className="button button-primary checkout-card-button" href={payment.checkoutUrl}>Pagar no cartão</a>
        </>}
        {!isCard && !payment.qrCodePix && !isBoleto && <p className="checkout-hint">Não recebemos o código do Pix. Atualize a página ou volte ao bolão e reserve de novo.</p>}

        <div className="checkout-status" role="status" aria-live="polite">
          <span className="checkout-spinner" aria-hidden="true" />
          <div>
            <strong>Aguardando o pagamento</strong>
            <small>Esta tela confirma sozinha, sem precisar atualizar.{isBoleto ? ' Boleto pode levar até 3 dias úteis; pagando pelo Pix, é na hora.' : ''}</small>
          </div>
        </div>
      </section>

      <aside className="checkout-card checkout-side" aria-label="Como pagar">
        {countdown && !isBoleto && <div className={`checkout-timer ${expired ? 'is-over' : countdown.left < 120 ? 'is-low' : ''}`}>
          <span>{expired ? 'Tempo da reserva esgotado' : 'Sua reserva vale por'}</span>
          <strong>{expired ? '00:00' : countdown.label}</strong>
          {expired && <small>Se você já pagou, aguarde: a confirmação chega sozinha. Se não, volte ao bolão e reserve de novo.</small>}
        </div>}
        {isBoleto && payment.vencimentoEm && <div className="checkout-timer"><span>Vencimento</span><strong>{clock.format(new Date(payment.vencimentoEm))}</strong></div>}
        <h2>{isCard ? 'Como funciona' : 'Como pagar'}</h2>
        {isCard
          ? <ol className="checkout-steps"><li>Toque em <b>Pagar no cartão</b>.</li><li>Informe os dados do cartão na página do Mercado Pago.</li><li>Pronto: você volta para esta tela e a cota é confirmada.</li></ol>
          : <ol className="checkout-steps"><li>Abra o app do seu banco e vá em <b>Pix</b>.</li><li>Escolha <b>Ler QR Code</b> ou <b>Pix Copia e Cola</b>.</li><li>Confira o valor e confirme. A cota é garantida na hora.</li></ol>}
        <p className="checkout-safe">Ambiente seguro. Pagamentos confirmados automaticamente.</p>
        <Link className="checkout-link" href={back}>Cancelar e voltar ao bolão</Link>
      </aside>
    </div>}
  </div>;
}
