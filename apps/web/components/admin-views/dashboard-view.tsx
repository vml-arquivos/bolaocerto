'use client';

import Link from 'next/link';
import { HealthPanel } from '../admin-health';
import { modalityNames } from '../../lib/domain';
import { money, dateTime, SectionHeading, Kpi, Panel, Empty } from './shared';
import type { AdminCtx } from './shared';

export function DashboardView({ ctx }: { ctx: AdminCtx }) {
  const { kpis, chart, chartMax, dashboard, period, setPeriod, busy, syncContests } = ctx;
  return <>
    <SectionHeading title="Resumo" action={<div className="admin-heading-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período"><option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="mes">Este mês</option></select><button className="admin-button admin-button-primary" onClick={syncContests} disabled={busy}>Atualizar sorteios</button></div>} />
    <HealthPanel />
    <div className="admin-kpi-grid"><Kpi label="Usuários" value={kpis.usuarios ?? 0} /><Kpi label="Bolões abertos" value={kpis.boloesAbertos ?? 0} hint={`${kpis.boloesFechados ?? 0} fechados`} tone="violet" /><Kpi label="Cotas pagas" value={kpis.cotasPagas ?? 0} hint={`${kpis.cotasReservadas ?? 0} reservadas`} tone="green" /><Kpi label="Arrecadação" value={money(kpis.arrecadacao)} tone="amber" /><Kpi label="Comissões pendentes" value={money(kpis.comissoesPendentes)} hint={`${kpis.afiliadosAtivos ?? 0} afiliados ativos`} tone="rose" /></div>
    <div className="admin-dashboard-grid">
      <Panel title="Quanto entrou" className="admin-panel-chart"><div className="admin-chart">{chart.length ? chart.slice(-14).map((row) => <div className="admin-chart-column" key={row.data}><span>{money(row.valor)}</span><div style={{ height: `${Math.max(8, (Number(row.valor ?? 0) / chartMax) * 100)}%` }} /><small>{String(row.data).slice(5).replace('-', '/')}</small></div>) : <Empty title="Ainda sem pagamentos" />}</div></Panel>
      <Panel title="Fecham em breve" action={<Link href="/admin?view=operacao" className="admin-text-link">Ver todos</Link>}><div className="admin-list">{(dashboard?.proximosCutoffs ?? []).length ? dashboard!.proximosCutoffs!.map((row) => <div className="admin-list-row" key={row.id}><div><strong>{modalityNames[row.modalidade] ?? row.modalidade} · concurso {row.concurso}</strong><span>{row.cotas ?? 0} cotas registradas</span></div><time>{dateTime(row.cutoffAt)}</time></div>) : <Empty title="Nada por enquanto" />}</div></Panel>
    </div>
    <div className="admin-dashboard-grid admin-dashboard-grid-three"><Panel title="Seus bolões"><div className="admin-summary-list"><div><span>Rascunhos</span><strong>{kpis.boloesRascunho ?? 0}</strong></div><div><span>Abertos</span><strong>{kpis.boloesAbertos ?? 0}</strong></div><div><span>Apostados</span><strong>{kpis.boloesRegistrados ?? 0}</strong></div><div><span>Apurados</span><strong>{kpis.boloesApurados ?? 0}</strong></div></div></Panel><Panel title="Cotas"><div className="admin-summary-list"><div><span>Disponíveis</span><strong>{kpis.cotasDisponiveis ?? 0}</strong></div><div><span>Reservadas</span><strong>{kpis.cotasReservadas ?? 0}</strong></div><div><span>Pagas</span><strong>{kpis.cotasPagas ?? 0}</strong></div><div><span>Premiadas</span><strong>{kpis.cotasPremiadas ?? 0}</strong></div></div></Panel><Panel title="Em dinheiro"><div className="admin-summary-list"><div><span>Gasto nas apostas</span><strong>{money(kpis.custoJogos)}</strong></div><div><span>Sua taxa</span><strong>{money(kpis.taxasAdministrativas)}</strong></div><div><span>Comissões pagas</span><strong>{money(kpis.comissoesPagas)}</strong></div><div><span>Para fazer</span><strong>{kpis.filaOperacional ?? 0}</strong></div></div></Panel></div>
  </>;
}
