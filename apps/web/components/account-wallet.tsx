'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { shortDate } from '../lib/domain';

export type WalletData = {
  saldoCentavos: number; saldo: number; cashbackPct: number; totalCashbackCentavos: number; totalUsadoCentavos: number;
  movimentos: Array<{ id: string; tipo: string; nome: string; valorCentavos: number; descricao: string | null; em: string }>;
};
export type ReferralData = {
  codigo: string; caminho: string; cashbackPct: number; cashbackTotalCentavos: number; totalIndicados: number; totalCompraram: number;
  indicados: Array<{ id: string; nome: string; desde: string; comprou: boolean }>;
};

export const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** Carteira: saldo em crédito BL, extrato e como usar. Crédito só serve para pagar cotas (não é conta bancária). */
export function WalletTab({ wallet }: { wallet: WalletData | null }) {
  if (!wallet) return <div className="empty-state compact"><h3>Carteira indisponível</h3><p>Não deu para consultar agora. Tente de novo em instantes.</p></div>;
  return <div className="account-section wallet-tab">
    <article className="wallet-balance" aria-label="Saldo da carteira">
      <small>Saldo disponível</small>
      <strong>{brl(wallet.saldoCentavos)}</strong>
      
      <div className="wallet-actions"><Link className="button button-primary" href="/aplicativo">Usar em um bolão</Link><Link className="button button-secondary" href="/minha-conta?aba=indicar">Ganhar cashback</Link></div>
    </article>
    <div className="wallet-totals">
      <div><small>Cashback recebido</small><strong>{brl(wallet.totalCashbackCentavos)}</strong></div>
      <div><small>Já usado em cotas</small><strong>{brl(wallet.totalUsadoCentavos)}</strong></div>
    </div>
    <article className="dashboard-card keep-title">
      <h2>Extrato</h2>
      {wallet.movimentos.length === 0 ? <p className="muted">Nada por aqui ainda.</p>
        : <ul className="wallet-moves">{wallet.movimentos.map((move) => <li key={move.id}>
          <div><strong>{move.nome}</strong><small>{shortDate(move.em)}{move.descricao ? ` · ${move.descricao}` : ''}</small></div>
          <span className={move.valorCentavos >= 0 ? 'is-in' : 'is-out'}>{move.valorCentavos >= 0 ? '+' : '−'} {brl(Math.abs(move.valorCentavos))}</span>
        </li>)}</ul>}
    </article>
    <details className="wallet-help"><summary>Como funciona a carteira</summary>
      <ul>
        <li>O crédito entra por cashback de indicação, reembolso em crédito ou ajuste feito pelo BL.</li>
        <li>Você usa o saldo para pagar cotas de qualquer bolão aberto.</li>
        <li>Se uma cota paga com saldo for estornada, o valor volta para a carteira.</li>
        <li>O saldo é crédito de uso na plataforma. Prêmios continuam sendo pagos por Pix na chave que você cadastrou em Meus dados.</li>
      </ul>
    </details>
  </div>;
}

/** Indicar amigos: link pessoal, compartilhamento e quem já entrou pelo seu link. */
export function ReferralTab({ pixMissing, onOpenData }: { pixMissing: boolean; onOpenData: () => void }) {
  const [data, setData] = useState<ReferralData | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    try { const response = await authenticatedFetch('/api/v1/usuarios/me/indicacao', { cache: 'no-store' }); setData(response.ok ? await response.json() as ReferralData : null); } catch { setData(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (data === undefined) return <p className="muted" aria-busy="true">Carregando…</p>;
  if (!data) return <div className="empty-state compact"><h3>Não foi possível abrir seu link</h3><p>Tente de novo em instantes.</p></div>;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link = `${origin}${data.caminho}`;
  const message = `Estou participando de bolões da Lotofácil, Mega-Sena e outras loterias pelo Bolão Livre. Entre pelo meu link: ${link}`;
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2400); } catch { /* o campo abaixo permite copiar à mão */ } }
  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { try { await navigator.share({ title: 'Bolão Livre', text: message, url: link }); return; } catch (error) { if ((error as { name?: string }).name === 'AbortError') return; } }
    void copy();
  }
  return <div className="account-section referral-tab">
    <article className="referral-card">
      <small>Seu link de indicação</small>
      <input readOnly value={link} aria-label="Seu link de indicação" onFocus={(event) => event.currentTarget.select()} />
      <div className="wallet-actions">
        <a className="button button-primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>
        <button type="button" className="button button-secondary" onClick={() => void copy()}>{copied ? 'Link copiado!' : 'Copiar link'}</button>
        <button type="button" className="button button-ghost" onClick={() => void share()}>Compartilhar…</button>
      </div>
      <p className="muted">{data.cashbackPct > 0 ? `Quando quem entrou pelo seu link paga uma cota, você recebe ${String(data.cashbackPct).replace('.', ',')}% da taxa de administração dessa cota como crédito na sua carteira.` : 'Quem entrar pelo seu link fica ligado à sua conta. O cashback por indicação ainda não está ativo; quando o BL ligar, ele cai direto na sua carteira.'}</p>
      
    </article>
    <div className="wallet-totals">
      <div><small>Amigos que entraram</small><strong>{data.totalIndicados}</strong></div>
      <div><small>Já compraram</small><strong>{data.totalCompraram}</strong></div>
      <div><small>Cashback ganho</small><strong>{brl(data.cashbackTotalCentavos)}</strong></div>
    </div>
    {pixMissing && <div className="notice" role="status"><strong>Cadastre sua chave Pix</strong><span>Ela é usada para pagar prêmios e devolver valores. <button type="button" className="text-link" onClick={onOpenData}>Abrir Meus dados</button></span></div>}
    <article className="dashboard-card keep-title"><h2>Quem entrou pelo seu link</h2>
      {data.indicados.length === 0 ? <p className="muted">Ainda ninguém.</p>
        : <ul className="wallet-moves">{data.indicados.map((friend) => <li key={friend.id}><div><strong>{friend.nome}</strong><small>Entrou em {shortDate(friend.desde)}</small></div><span className={friend.comprou ? 'is-in' : 'is-wait'}>{friend.comprou ? 'Já comprou' : 'Ainda não comprou'}</span></li>)}</ul>}
    </article>
  </div>;
}
