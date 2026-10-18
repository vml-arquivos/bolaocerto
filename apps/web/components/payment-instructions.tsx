'use client';

import { useCallback, useEffect, useState } from 'react';
import { money } from '../lib/domain';

export type PaymentView = {
  status: string; metodo?: string; qrCodePix?: string | null; qrCodeUrl?: string | null; linhaDigitavel?: string | null; boletoUrl?: string | null;
  vencimentoEm?: string | null; valorBruto?: string;
};

const dueFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  }
  return <div className="pix-box"><small>{label}</small><code style={{ wordBreak: 'break-all' }}>{value}</code><button type="button" className="button button-secondary" onClick={() => void copy()}>{copied ? 'Copiado!' : 'Copiar código'}</button></div>;
}

/** Mostra Pix e/ou boleto da cobrança e acompanha a confirmação automaticamente. */
export function PaymentInstructions({ shareId, payment, onPaid }: { shareId: string; payment: PaymentView; onPaid?: () => void }) {
  const [current, setCurrent] = useState<PaymentView>(payment);
  useEffect(() => setCurrent(payment), [payment]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/cotas/${shareId}/pagamento`, { credentials: 'include' });
      if (!response.ok) return;
      const next = await response.json() as PaymentView;
      setCurrent((previous) => ({ ...previous, ...next }));
      if (next.status === 'confirmado') onPaid?.();
    } catch { /* tenta novamente no próximo ciclo */ }
  }, [shareId, onPaid]);

  useEffect(() => {
    if (current.status !== 'pendente') return;
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(timer);
  }, [current.status, refresh]);

  if (current.status === 'confirmado') return <div className="form-message form-success" role="status"><strong>Pagamento confirmado!</strong> Sua cota está garantida.</div>;
  if (current.status === 'falhou' || current.status === 'estornado') return <div className="form-message form-error" role="alert">Esta cobrança foi cancelada. Faça uma nova reserva para participar.</div>;
  const isBoleto = current.metodo === 'boleto';
  return <div className="payment-instructions" style={{ display: 'grid', gap: 12 }}>
    {current.vencimentoEm && <p className="muted">{isBoleto ? 'Boleto' : 'Pix'} válido até <strong>{dueFormat.format(new Date(current.vencimentoEm))}</strong>{current.valorBruto ? <> · valor <strong>{money(current.valorBruto)}</strong></> : null}</p>}
    {current.qrCodeUrl && !isBoleto && <img src={current.qrCodeUrl} alt="QR Code Pix" width={200} height={200} style={{ background: '#fff', padding: 8, borderRadius: 8, justifySelf: 'center' }} />}
    {current.qrCodePix && <CopyField label="Pix copia e cola" value={current.qrCodePix} />}
    {isBoleto && current.linhaDigitavel && <CopyField label="Linha digitável do boleto" value={current.linhaDigitavel} />}
    {isBoleto && current.boletoUrl && <a className="button button-secondary" href={current.boletoUrl} target="_blank" rel="noreferrer">Abrir boleto (PDF)</a>}
    <p className="muted" role="status">Aguardando pagamento… esta tela atualiza sozinha. {isBoleto ? 'Boletos podem levar até 3 dias úteis para compensar; pagando pelo Pix do boleto a confirmação é imediata.' : ''}</p>
  </div>;
}
