'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { formatBRL as money } from '../lib/format';
import { modalityNames } from '../lib/domain';
import { acceptDistribution, DistributionTermBox, type DistributionTerm } from './distribution-accept';

type Pending = { codigo: string; bolaoId: string; modalidade: string; numeroConcurso: number; nomeEspecial?: string | null; valorCota: string; cotasIlimitadas: boolean; totalCotas: number | null; cotasDisponiveis: number | null; encerraEm: string; enviadoPor: string; enviadoEm: string };

const when = (value: string) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const title = (item: Pending) => `${modalityNames[item.modalidade] ?? item.modalidade}${item.nomeEspecial ? ` · ${item.nomeEspecial}` : ''}${item.numeroConcurso > 0 ? ` #${item.numeroConcurso}` : ''}`;

/**
 * Bolões que a equipe do BL enviou para este afiliado e que ainda esperam o aceite. Ele lê o termo, aceita e o bolão entra
 * no painel para vender. `compact` (na visão geral) só avisa quantos são e leva para a aba Bolões.
 */
export function AffiliatePendingPools({ compact = false, onAccepted, onOpen }: { compact?: boolean; onAccepted?: () => void; onOpen?: () => void }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [term, setTerm] = useState<DistributionTerm | null>(null);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const response = await authenticatedFetch('/api/v1/afiliados/me/boloes-recebidos', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    setItems(Array.isArray(data.pendentes) ? data.pendentes : []);
    setTerm(data.termo ?? null);
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function accept(item: Pending) {
    setBusy(true); setMessage(null);
    try {
      await acceptDistribution(item.codigo);
      setMessage({ ok: true, text: `${title(item)} entrou no seu painel. Copie o seu link de venda em "Bolões recebidos da BL".` });
      setOpen(''); await load(); onAccepted?.();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível aceitar.' }); }
    finally { setBusy(false); }
  }

  if (!items.length && !message) return null;
  if (compact) return items.length ? <section className="affiliate-pending-banner" role="status"><div><strong>{items.length === 1 ? 'Você tem 1 bolão para aceitar' : `Você tem ${items.length} bolões para aceitar`}</strong><small>A equipe do BL enviou para você vender. Aceite o termo e ele entra no seu painel.</small></div><button type="button" className="button button-primary" onClick={onOpen}>Ver e aceitar</button></section> : null;

  return <section className="affiliate-table-card affiliate-pending" id="boloes-para-aceitar">
    <div className="affiliate-card-heading"><div><h2>Bolões para aceitar</h2><p>A equipe do BL escolheu você para vender estes bolões. Leia o termo e aceite: o bolão entra no seu painel e as vendas pelo seu link contam para você.</p></div></div>
    {message && <div className={`form-message ${message.ok ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
    {items.length > 0 && <div className="affiliate-list-cards">{items.map((item) => <article key={item.codigo}>
      <div className="pool-card-topline"><strong>{title(item)}</strong><span className="affiliate-status aguardando">aguardando seu aceite</span></div>
      <strong>{money(item.valorCota)} por cota · {item.cotasIlimitadas ? 'cotas ilimitadas' : `${item.cotasDisponiveis ?? 0} livres de ${item.totalCotas ?? 0}`}</strong>
      <small>Enviado por {item.enviadoPor} em {when(item.enviadoEm)} · venda até {when(item.encerraEm)}</small>
      {open === item.codigo && term
        ? <DistributionTermBox termo={term} busy={busy} onAccept={() => void accept(item)} />
        : <div className="affiliate-row-actions"><button type="button" className="button button-primary" onClick={() => { setOpen(item.codigo); setMessage(null); }}>Ler o termo e aceitar</button><a className="button button-secondary" href={`/boloes/${item.bolaoId}`}>Ver o bolão</a></div>}
    </article>)}</div>}
  </section>;
}
