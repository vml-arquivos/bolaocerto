'use client';
import { useSaleClock } from './live-storefront';
import { canPurchase, saleRuleState, withinSaleWindow } from '../lib/pool-availability';
import type { PoolSalesRules } from '../lib/domain';
import Link from 'next/link';
import type { LegalDocumentData } from './legal-document';
import { FormEvent, useEffect, useState } from 'react';
import { money, PoolRelease } from '../lib/domain';
import { ReleaseMeter } from './release-meter';
import { NotifyMe } from './notify-me';
import { PaymentInstructions, PaymentView } from './payment-instructions';

type Method = 'pix' | 'boleto' | 'cartao' | 'pix_automatico';
const METHOD_LABEL: Record<Method, string> = { pix: 'Pix (confirmação imediata)', boleto: 'Boleto (com Pix incluso)', cartao: 'Cartão de crédito ou débito', pix_automatico: 'Pix Automático (recorrente)' };

export function PurchaseForm({ poolId, available, unitPrice, status, paymentsEnabled, release, cutoffAt, contestStatus, hasResult, serverNow, rules }: { rules?: PoolSalesRules; cutoffAt?: string; contestStatus?: string; hasResult: boolean; serverNow: number; poolId: string; available: number | null; unitPrice: string; status: string; paymentsEnabled: boolean; release?: PoolRelease }) {
  const now = useSaleClock(serverNow);
  const sale = { status, cotasDisponiveis: available, concurso: { cutoffAt, status: contestStatus }, resultado: hasResult, liberacao: release, regrasVenda: rules };
  const [message, setMessage] = useState('');
  const [contract, setContract] = useState<LegalDocumentData | null>(null);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { void fetch('/api/v1/config/mandato', { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Contrato indisponível.'); setContract(await response.json()); }).catch(e => setMessage(e.message)); }, []);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<{ nome: string } | null | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [otherHolder, setOtherHolder] = useState(false);
  useEffect(() => { void fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' }).then(async (response) => setMe(response.ok ? await response.json() as { nome: string } : null)).catch(() => setMe(null)); }, []);
  const [methods, setMethods] = useState<Method[]>(['pix']);
  const [method, setMethod] = useState<Method>('pix');
  const [created, setCreated] = useState<{ shareId: string; payment: PaymentView } | null>(null);
  const unlimited = available === null;
  const locked = withinSaleWindow(sale, now) && Boolean(release?.condicional && !release.liberado);
  const enabled = paymentsEnabled && canPurchase(sale, now);
  const ruleState = withinSaleWindow(sale, now) ? saleRuleState(sale, now) : 'aberta';
  const maxPerPerson = rules?.maxCotasPorPessoa ?? null;
  const maxQuantity = maxPerPerson === null ? (unlimited ? undefined : available ?? undefined) : unlimited ? maxPerPerson : Math.min(maxPerPerson, available ?? maxPerPerson);
  const when = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '';

  useEffect(() => {
    if (!paymentsEnabled) return;
    void fetch('/api/v1/pagamentos/metodos').then((response) => (response.ok ? response.json() : null)).then((data: { metodos?: string[] } | null) => {
      const available = (data?.metodos ?? ['pix']).filter((item): item is Method => item === 'pix' || item === 'boleto' || item === 'cartao');
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
      const reserveResponse = await fetch('/api/v1/cotas/reservar', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bolaoId: poolId, quantidade: Number(form.get('quantidade')), ...(otherHolder ? { titularCpf: String(form.get('titularCpf')), titularNome: String(form.get('titularNome')) } : {}), termoMandatoHash: contract.hash, aceitoTermos: true }) });
      if (reserveResponse.status === 401) throw new Error('Entre na sua conta antes de reservar uma cota.');
      const reserve = await reserveResponse.json() as { id?: string; message?: string | string[] };
      if (!reserveResponse.ok || !reserve.id) throw new Error(Array.isArray(reserve.message) ? reserve.message.join(' ') : reserve.message || 'Falha ao reservar.');
      const paymentResponse = await fetch(`/api/v1/cotas/${reserve.id}/pagamento`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metodo: method }) });
      const payment = await paymentResponse.json() as PaymentView & { message?: string | string[] };
      if (!paymentResponse.ok) throw new Error((Array.isArray(payment.message) ? payment.message.join(' ') : payment.message) || 'Reserva criada, mas o pagamento não pôde ser iniciado. Consulte Minhas Cotas.');
      setCreated({ shareId: reserve.id, payment });
      // Pagamento em tela própria: QR Code, código e confirmação; depois volta para este bolão.
      try { window.sessionStorage.setItem(`bl-checkout:${reserve.id}`, JSON.stringify({ voltar: `/boloes/${poolId}`, quantidade: Number(form.get('quantidade')), titular: otherHolder ? String(form.get('titularNome')) : (me?.nome ?? '') })); } catch { /* sem sessionStorage: o checkout usa Minhas Cotas */ }
      setMessage('Reserva concluída. Abrindo o pagamento…');
      window.location.assign(`/checkout/${reserve.id}?voltar=${encodeURIComponent(`/boloes/${poolId}`)}`);
      return;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }

  return <aside className="purchase-card"><span className="overline">Participar</span><div className="purchase-price"><strong>{money(unitPrice)}</strong><span>por cota · {unlimited ? 'cotas ilimitadas' : `${available} ${available === 1 ? 'disponível' : 'disponíveis'}`}</span></div>
    {rules?.antecipada && <div className="notice presale-notice"><strong>Pré-venda</strong><span>O jogo será registrado na lotérica depois do fim das vendas e o comprovante será enviado a todos os cotistas.</span></div>}
    {(rules?.inicioEm || rules?.fimEm) && <p className="muted sale-window">{rules?.inicioEm ? `Venda de ${when(rules.inicioEm)}` : 'Venda'}{rules?.fimEm ? ` até ${when(rules.fimEm)}` : ''}</p>}
    {rules?.texto && <div className="sale-rules-text"><strong>Regras de venda</strong><p>{rules.texto}</p></div>}
    {release?.condicional && <ReleaseMeter release={release} />}
    {!paymentsEnabled ? <div className="notice payment-disabled"><strong>Reservas temporariamente indisponíveis</strong><span>As reservas deste bolão estão pausadas no momento. Tente novamente em alguns instantes.</span></div>
      : enabled && me === null ? <div className="buy-login"><p>Entre na sua conta para participar. Leva um minuto.</p><Link className="button button-primary" href={`/login?next=${encodeURIComponent(`/boloes/${poolId}`)}`}>Entrar</Link><Link className="button button-secondary" href="/cadastro">Criar conta</Link></div>
      : enabled && me === undefined ? <p className="muted" aria-busy="true">Carregando…</p>
      : enabled ? <form onSubmit={submit}>
        <div className="buy-qty"><label htmlFor="quantidade">Cotas</label>
          <div className="stepper"><button type="button" aria-label="Menos uma cota" onClick={() => setQty((value) => Math.max(1, value - 1))} disabled={qty <= 1}>−</button>
            <input id="quantidade" name="quantidade" type="number" inputMode="numeric" min={1} {...(maxQuantity === undefined ? {} : { max: maxQuantity })} value={qty} onChange={(event) => setQty(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} required />
            <button type="button" aria-label="Mais uma cota" onClick={() => setQty((value) => (maxQuantity === undefined ? value + 1 : Math.min(maxQuantity, value + 1)))} disabled={maxQuantity !== undefined && qty >= maxQuantity}>+</button></div>
          <strong className="buy-total" aria-live="polite">{money(Number(unitPrice) * qty)}</strong></div>
        {maxPerPerson !== null && <small className="muted">Máximo de {maxPerPerson} {maxPerPerson === 1 ? 'cota' : 'cotas'} por pessoa.</small>}
        {!otherHolder ? <p className="buy-holder">Em nome de <strong>{me?.nome}</strong> · <button type="button" className="text-link" onClick={() => setOtherHolder(true)}>outro titular</button></p>
          : <div className="buy-holder-fields"><div className="field"><label htmlFor="titularNome">Nome do titular</label><input id="titularNome" name="titularNome" minLength={2} required /></div>
            <div className="field"><label htmlFor="titularCpf">CPF do titular</label><input id="titularCpf" name="titularCpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div>
            <button type="button" className="text-link" onClick={() => setOtherHolder(false)}>Usar meu cadastro</button></div>}
        {methods.length > 1 && <div className="field"><label htmlFor="metodo">Forma de pagamento</label><select id="metodo" value={method} onChange={(event) => setMethod(event.target.value as Method)}>{methods.map((item) => <option key={item} value={item}>{METHOD_LABEL[item]}</option>)}</select></div>}
        <details className="buy-contract"><summary>Ler o contrato desta compra</summary><div className="legal-text">{contract?.texto}</div></details>{contract && !contract.aprovado && <p className="notice">Contratação aguardando revisão dos documentos pelo operador.</p>}<label className="check-line"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li e aceito o <Link href="/termos" target="_blank"><u>contrato de participação</u></Link> e confirmo ter mais de 18 anos.</span></label>
        <button className="button button-primary" disabled={loading || !accepted || !contract?.aprovado}>{loading ? 'Processando…' : method === 'boleto' ? 'Reservar e gerar boleto' : method === 'cartao' ? 'Reservar e pagar no cartão' : 'Reservar e gerar Pix'}</button>
      </form> : ruleState === 'em_breve' ? <div className="notice"><strong>A venda ainda não começou</strong><span>As cotas abrem em {when(rules?.inicioEm)}.</span></div>
        : locked ? <div className="notice"><strong>Cotas ainda não liberadas</strong><span>Assim que o prêmio estimado atingir o valor de gatilho, as cotas serão abertas automaticamente nesta página.</span></div>
        : <div className="notice"><strong>Participação indisponível</strong><span>Este bolão não aceita novas reservas.</span></div>}
    {locked && <NotifyMe poolId={poolId} />}
    {message && <div className={`form-message ${created ? 'form-success' : 'form-error'}`}>{message}</div>}
    {created && <><PaymentInstructions shareId={created.shareId} payment={created.payment} /><Link className="button button-secondary" href="/minha-conta">Ver Minhas Cotas</Link></>}
  </aside>;
}
