'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchAdmin, money, SectionHeading, Kpi, Panel } from './shared';

type Kpis = Record<string, string | number | undefined>;
type NfseConfig = { modo?: string; pagamentosSemNota?: number; valorServicoSemNota?: number; valorRegistroSemNota?: number; pronto?: boolean };

/** Painel único do dinheiro: quanto entrou, o que é serviço (base da nota), o que é custo dos jogos e o que falta pagar. */
export function FinanceView() {
  const [period, setPeriod] = useState('30d');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [nfse, setNfse] = useState<NfseConfig | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    setError('');
    void Promise.all([fetchAdmin(`/api/v1/admin/dashboard?periodo=${period}`), fetchAdmin('/api/v1/admin/nfse/configuracao').catch(() => null)])
      .then(([dashboard, config]) => { if (!off) { setKpis((dashboard?.kpis ?? {}) as Kpis); setNfse(config as NfseConfig | null); } })
      .catch((failure) => { if (!off) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar o painel financeiro.'); });
    return () => { off = true; };
  }, [period]);
  const num = (value: unknown) => Number(value ?? 0);
  const platform = num(kpis?.taxasAdministrativas) - num(kpis?.comissoesPendentes) - num(kpis?.comissoesPagas);
  return <>
    <SectionHeading title="Painel financeiro" action={<select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período"><option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="mes">Este mês</option></select>} />
    {error && <div className="form-message form-error" role="alert">{error}</div>}
    {kpis && <>
      <div className="admin-kpi-grid">
        <Kpi label="Entrou (pago pelos clientes)" value={money(kpis.arrecadacao)} tone="green" />
        <Kpi label="Custo dos jogos" value={money(kpis.custoJogos)} tone="blue" />
        <Kpi label="Taxa de administração" value={money(kpis.taxasAdministrativas)} tone="violet" />
        <Kpi label="Comissões a pagar" value={money(kpis.comissoesPendentes)} hint={`${money(kpis.comissoesPagas)} já pagas`} tone="amber" />
        <Kpi label="Fica com a plataforma" value={money(platform)} tone="green" />
      </div>
      <div className="admin-dashboard-grid">
        <Panel title="Para fazer agora">
          <div className="admin-summary-list">
            <div><span>Comissões prontas para pagar</span><strong>{money(kpis.comissoesPendentes)}</strong></div>
            <div><span>Pagamentos sem nota fiscal</span><strong>{nfse?.pagamentosSemNota ?? '—'}</strong></div>
            <div><span>Serviço a faturar (só a taxa)</span><strong>{money(nfse?.valorServicoSemNota)}</strong></div>
          </div>
          <div className="admin-row-actions" style={{ marginTop: 12 }}><Link className="admin-button admin-button-small admin-button-ghost" href="/admin?view=repasses">Pagar comissões</Link><Link className="admin-button admin-button-small admin-button-ghost" href="/admin?view=notas-fiscais">Notas fiscais</Link><Link className="admin-button admin-button-small admin-button-ghost" href="/admin?view=recebimentos">Ver recebimentos</Link><Link className="admin-button admin-button-small admin-button-ghost" href="/admin?view=comissoes">Ver comissões</Link></div>
        </Panel>
      </div>
    </>}
  </>;
}
