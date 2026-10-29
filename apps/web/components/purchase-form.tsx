'use client';
import { useSaleClock } from './live-storefront';
import { canPurchase, withinSaleWindow } from '../lib/pool-availability';
import Link from 'next/link';
import type { LegalDocumentData } from './legal-document';
import { FormEvent, useEffect, useState } from 'react';
import { money, PoolRelease } from '../lib/domain';
import { ReleaseMeter } from './release-meter';
import { NotifyMe } from './notify-me';
import { PaymentInstructions, PaymentView } from './payment-instructions';

type Method = 'pix' | 'boleto' | 'cartao' | 'pix_automatico';
const METHOD_LABEL: Record<Method, string> = { pix: 'Pix (confirmação imediata)', boleto: 'Boleto (com Pix incluso)', cartao: 'Cartão de crédito', pix_automatico: 'Pix Automático (recorrente)' };

export function PurchaseForm({ poolId, available, unitPrice, status, paymentsEnabled, release, cutoffAt, contestStatus, hasResult, serverNow }: { cutoffAt?: string; contestStatus?: string; hasResult: boolean; serverNow: number; poolId: string; available: number | null; unitPrice: string; status: string; paymentsEnabled: boolean; release?: PoolRelease }) {
  const now = useSaleClock(serverNow);
  const sale = { status, cotasDisponiveis: available, concurso: { cutoffAt, status: contestStatus }, resultado: hasResult, liberacao: release };
  const [message, setMessage] = useState('');
  const [contract, setContract] = useState<LegalDocumentData | null>(null);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { void fetch('/api/v1/config/mandato', { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Contrato indisponível.'); setContract(await response.json()); }).catch(e => setMessage(e.message)); }, []);
  const [loading, setLoading] = useState(false);
  const [methods, setMethods] = useState<Method[]>(['pix']);
  const [method, setMethod] = useState<Method>('pix');
  const [created, setCreated] = useState<{ shareId: string; payment: PaymentView } | null>(null);
  const unlimited = available === null;
  const locked = withinSaleWindow(sale, now) && Boolean(release?.condicional && !release.liberado);
  const enabled = paymentsEnabled && canPurchase(sale, now);

  useEffect(() => {
    if (!paymentsEnabled) return;
    void fetch('/api/v1/pagamentos/metodos').then((response) => (response.ok ? response.json() : null)).then((data: { metodos?: string[] } | null) => {
      const available = (data?.metodos ?? ['pix']).filter((item): item is Method => item === 'pix' || item === 'boleto');
      if (available.length) { setMethods(available); setMethod(available[0] as Method); }
    }).catch(() => undefined);
  }, [paymentsEnabled]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) { setMessage('Você está sem conexão. Reconecte e confira suas cotas antes de tentar novamente.'); return; }
    if (!enabled) { setMessage('Este bolão não aceita novas reservas. Consulte os próximos concursos.'); return; }
    setLoading(true); setMessage(''); setCreated(null);
    const form = new FormData(event.currentTarget);
    try {
      if (!contract?.aprovado || !accepted) throw new Error('Leia e aceite o contrato vigente antes de reservar.');
      const reserveResponse = await fetch('/api/v1/cotas/reservar', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bolaoId: poolId, quantidade: Number(form.get('quantidade')), titularCpf: String(form.get('titularCpf')), titularNome: String(form.get('titularNome')), termoMandatoHash: contract.hash, aceitoTermos: true }) });
      if (reserveResponse.status === 401) throw new Error('Entre na sua conta antes de reservar uma cota.');
      const reserve = await reserveResponse.json() as { id?: string; message?: string | string[] };
      if (!reserveResponse.ok || !reserve.id) throw new Error(Array.isArray(reserve.message) ? reserve.message.join(' ') : reserve.message || 'Falha ao reservar.');
      const paymentResponse = await fetch(`/api/v1/cotas/${reserve.id}/pagamento`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metodo: method }) });
      const payment = await paymentResponse.json() as PaymentView & { message?: string | string[] };
      if (!paymentResponse.ok) throw new Error((Array.isArray(payment.message) ? payment.message.join(' ') : payment.message) || 'Reserva criada, mas o pagamento não pôde ser iniciado. Consulte Minhas Cotas.');
      setCreated({ shareId: reserve.id, payment });
      setMessage(method === 'boleto' ? 'Reserva concluída. Pague o boleto ou use o Pix incluso.' : 'Reserva concluída. Use o código Pix abaixo para pagar.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }

  return <aside className="purchase-card"><span className="overline">Participar agora</span><p className="price">{money(unitPrice)}</p><p className="muted">por cota · {unlimited ? 'cotas ilimitadas' : `${available} disponíveis`}</p>
    {release?.condicional && <ReleaseMeter release={release} />}
    {!paymentsEnabled ? <div className="notice payment-disabled"><strong>Reservas temporariamente indisponíveis</strong><span>As reservas deste bolão estão pausadas no momento. Tente novamente em alguns instantes.</span></div>
      : enabled ? <form onSubmit={submit}>
        <div className="field"><label htmlFor="quantidade">Quantidade de cotas</label><input id="quantidade" name="quantidade" type="number" min={1} {...(unlimited ? {} : { max: available ?? undefined })} defaultValue={1} required /></div>
        <div className="field"><label htmlFor="titularNome">Nome do titular</label><input id="titularNome" name="titularNome" minLength={2} required /></div>
        <div className="field"><label htmlFor="titularCpf">CPF do titular</label><input id="titularCpf" name="titularCpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div>
        {methods.length > 1 && <div className="field"><label htmlFor="metodo">Forma de pagamento</label><select id="metodo" value={method} onChange={(event) => setMethod(event.target.value as Method)}>{methods.map((item) => <option key={item} value={item}>{METHOD_LABEL[item]}</option>)}</select></div>}
        <details><summary>Contrato desta compra · {contract?.versao ?? 'carregando'}</summary><div className="legal-text">{contract?.texto}</div></details>{contract && !contract.aprovado && <p className="notice">Contratação aguardando revisão dos documentos pelo operador.</p>}<label className="check-line"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li e aceito os <Link href="/termos" target="_blank"><u>termos de participação</u></Link>, confirmo ser maior de 18 anos e autorizo o registro.</span></label>
        <button className="button button-primary" disabled={loading || !accepted || !contract?.aprovado}>{loading ? 'Processando…' : method === 'boleto' ? 'Reservar e gerar boleto' : 'Reservar e gerar Pix'}</button>
      </form> : locked ? <div className="notice"><strong>Cotas ainda não liberadas</strong><span>Assim que o prêmio estimado atingir o valor de gatilho, as cotas serão abertas automaticamente nesta página.</span></div>
        : <div className="notice"><strong>Participação indisponível</strong><span>Este bolão não aceita novas reservas.</span></div>}
    {locked && <NotifyMe poolId={poolId} />}
    {message && <div className={`form-message ${created ? 'form-success' : 'form-error'}`}>{message}</div>}
    {created && <><PaymentInstructions shareId={created.shareId} payment={created.payment} /><Link className="button button-secondary" href="/minha-conta">Ver Minhas Cotas</Link></>}
  </aside>;
}
