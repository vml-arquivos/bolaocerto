'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { money } from '../lib/domain';

export function PurchaseForm({ poolId, available, unitPrice, status, paymentsEnabled }: { poolId: string; available: number | null; unitPrice: string; status: string; paymentsEnabled: boolean }) {
  const [message, setMessage] = useState(''); const [pix, setPix] = useState(''); const [loading, setLoading] = useState(false);
  const unlimited = available === null;
  const enabled = status === 'aberto' && (unlimited || available > 0) && paymentsEnabled;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(''); setPix(''); const form = new FormData(event.currentTarget);
    try {
      const configResponse = await fetch('/api/v1/config/mandato'); const config = await configResponse.json() as { hash?: string; message?: string };
      if (!configResponse.ok || !config.hash) throw new Error(config.message || 'Termo de participação indisponível.');
      const reserveResponse = await fetch('/api/v1/cotas/reservar', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bolaoId: poolId, quantidade: Number(form.get('quantidade')), titularCpf: String(form.get('titularCpf')), titularNome: String(form.get('titularNome')), termoMandatoHash: config.hash }) });
      if (reserveResponse.status === 401) throw new Error('Entre na sua conta antes de reservar uma cota.');
      const reserve = await reserveResponse.json() as { id?: string; message?: string | string[] };
      if (!reserveResponse.ok || !reserve.id) throw new Error(Array.isArray(reserve.message) ? reserve.message.join(' ') : reserve.message || 'Falha ao reservar.');
      const paymentResponse = await fetch(`/api/v1/cotas/${reserve.id}/pagamento`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metodo: 'pix' }) });
      const payment = await paymentResponse.json() as { qrCodePix?: string; message?: string };
      if (!paymentResponse.ok) throw new Error(payment.message || 'Reserva criada, mas o pagamento não pôde ser iniciado. Consulte Minhas Cotas.');
      setPix(payment.qrCodePix || 'Cobrança criada. Consulte Minhas Cotas.'); setMessage('Reserva concluída. Use o código Pix abaixo para continuar.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }
  return <aside className="purchase-card"><span className="overline">Participar agora</span><p className="price">{money(unitPrice)}</p><p className="muted">por cota · {unlimited ? 'cotas ilimitadas' : `${available} disponíveis`}</p>{!paymentsEnabled ? <div className="notice payment-disabled"><strong>Pagamentos ainda não habilitados</strong><span>Nesta primeira etapa, valide cadastro, acesso, concursos, bolões e responsividade. Reservas financeiras e pagamentos serão liberados posteriormente.</span></div> : enabled ? <form onSubmit={submit}><div className="field"><label htmlFor="quantidade">Quantidade de cotas</label><input id="quantidade" name="quantidade" type="number" min={1} {...(unlimited ? {} : { max: available ?? undefined })} defaultValue={1} required /></div><div className="field"><label htmlFor="titularNome">Nome do titular</label><input id="titularNome" name="titularNome" minLength={2} required /></div><div className="field"><label htmlFor="titularCpf">CPF do titular</label><input id="titularCpf" name="titularCpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div><label className="check-line"><input type="checkbox" required/><span>Li e aceito os <Link href="/termos" target="_blank"><u>termos de participação</u></Link>, confirmo ser maior de 18 anos e autorizo o registro.</span></label><button className="button button-primary" disabled={loading}>{loading ? 'Processando…' : 'Reservar e gerar Pix'}</button></form> : <div className="notice"><strong>Participação indisponível</strong><span>Este bolão não aceita novas reservas.</span></div>}{message && <div className={`form-message ${pix ? 'form-success' : 'form-error'}`}>{message}</div>}{pix && <div className="pix-box"><small>Pix copia e cola {pix.startsWith('PIX-TESTE') && '— ambiente de teste'}</small><code>{pix}</code><Link className="button button-secondary" href="/minha-conta">Ver Minhas Cotas</Link></div>}</aside>;
}
