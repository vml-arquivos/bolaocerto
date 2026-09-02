'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminShell } from './admin-shell';
import { AdminGroupForm, AffiliateNetworkTable, InviteManager, ManagedUserForm } from './admin-people-tools';
import { PoolWizard as SimplePoolWizard } from './pool-wizard';

type RecordValue = Record<string, any>;
type PagePayload = { items?: RecordValue[]; pagination?: { page: number; pageSize: number; total: number; pages: number } };
type DashboardPayload = { kpis: RecordValue; graficos?: { recebimentos?: RecordValue[] }; proximosCutoffs?: RecordValue[] };

type GameDraft = { ordem: number; numeros: number[]; custo: string };
type ToastState = { type: 'success' | 'error'; text: string } | null;

const modalityNames: Record<string, string> = {
  megasena: 'Mega-Sena',
  lotofacil: 'Lotofácil',
  quina: 'Quina',
  lotomania: 'Lotomania',
  duplasena: 'Dupla Sena',
  timemania: 'Timemania',
  diadesorte: 'Dia de Sorte',
  supersete: 'Super Sete',
  loteca: 'Loteca',
};

const modalityLimits: Record<string, { max: number; min: number; pick: number }> = {
  megasena: { max: 60, min: 6, pick: 6 },
  lotofacil: { max: 25, min: 15, pick: 15 },
  quina: { max: 80, min: 5, pick: 5 },
  lotomania: { max: 100, min: 50, pick: 50 },
  duplasena: { max: 50, min: 6, pick: 6 },
  timemania: { max: 80, min: 10, pick: 10 },
  diadesorte: { max: 31, min: 7, pick: 7 },
  supersete: { max: 7, min: 7, pick: 7 },
  loteca: { max: 14, min: 1, pick: 1 },
};

const viewsWithTables = new Set(['concursos', 'boloes', 'jogos', 'cotas', 'participantes', 'recebimentos', 'pagamentos', 'afiliados', 'comissoes', 'repasses', 'usuarios', 'operacao', 'comprovantes', 'lotericas', 'auditoria', 'grupos', 'rede', 'convites']);

function money(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 'R$ 0,00';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function dateOnly(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function statusLabel(status: unknown) {
  return String(status ?? '—').replaceAll('_', ' ').replaceAll('-', ' ');
}

function statusClass(status: unknown) {
  const normalized = String(status ?? '').toLowerCase();
  if (['paga', 'pago', 'confirmado', 'aprovado', 'registrado', 'apurado', 'ativo'].includes(normalized)) return 'status-chip status-success';
  if (['pendente', 'reservada', 'rascunho'].includes(normalized)) return 'status-chip status-warning';
  if (['falhou', 'cancelada', 'cancelado', 'reprovado', 'estornado', 'inativo'].includes(normalized)) return 'status-chip status-danger';
  if (['aberto', 'fechado'].includes(normalized)) return 'status-chip status-info';
  return 'status-chip';
}

async function authFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  return response;
}

async function fetchAdmin(path: string, options?: RequestInit) {
  const response = await authFetch(path, options);
  if (response.status === 401) {
    window.location.href = '/login?next=/admin';
    throw new Error('Sessão expirada.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível carregar os dados.');
  return payload;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="admin-page-heading"><div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Kpi({ label, value, hint, tone = 'blue' }: { label: string; value: string | number; hint?: string; tone?: 'blue' | 'violet' | 'green' | 'amber' | 'rose' }) {
  return <article className={`admin-kpi admin-kpi-${tone}`}><span className="admin-kpi-icon" aria-hidden="true">{tone === 'green' ? '↗' : tone === 'amber' ? '!' : tone === 'rose' ? '◎' : tone === 'violet' ? '◆' : '◌'}</span><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

function Panel({ title, description, action, children, className = '' }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`admin-panel ${className}`}><div className="admin-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="admin-empty"><span>BL</span><strong>{title}</strong><p>{description}</p></div>;
}

function Table({ children, minWidth = 720 }: { children: React.ReactNode; minWidth?: number }) {
  return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth }}>{children}</table></div>;
}

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view') || 'visao-geral';
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [payload, setPayload] = useState<PagePayload>({ items: [] });
  const [contests, setContests] = useState<RecordValue[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [affiliateOptions, setAffiliateOptions] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [period, setPeriod] = useState('30d');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);
  const [editingPool, setEditingPool] = useState<RecordValue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '50' });
      if (search) query.set('busca', search);
      if (statusFilter) query.set('status', statusFilter);
      if (view === 'visao-geral') query.set('periodo', period);
      const endpointView = view === 'participantes' ? 'cotas' : view === 'pagamentos' ? 'recebimentos' : view === 'jogos' ? 'boloes' : view === 'comprovantes' ? 'operacao' : view === 'rede' ? 'afiliados' : view;
      const endpoint = view === 'visao-geral' ? `/api/v1/admin/dashboard?${query.toString()}` : `/api/v1/admin/${endpointView}?${query.toString()}`;
      const result = await fetchAdmin(endpoint);
      if (view === 'visao-geral') setDashboard(result);
      else setPayload(result);
      if (view === 'visao-geral' || view === 'boloes') {
        const [contestPayload, group] = await Promise.all([fetchAdmin('/api/v1/admin/concursos?page=1&pageSize=100'), fetch('/api/v1/grupos/bl-oficial').then((response) => response.ok ? response.json() : null)]);
        setContests(contestPayload.items ?? []);
        setGroupId(group?.id ?? null);
      }
      if (['afiliados', 'rede', 'convites', 'grupos'].includes(view)) {
        const affiliatePayload = await fetchAdmin('/api/v1/admin/afiliados?page=1&pageSize=100');
        setAffiliateOptions(affiliatePayload.items ?? []);
      }
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar o painel.' });
    } finally {
      setLoading(false);
    }
  }, [period, search, statusFilter, view]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(timeout); }, [toast]);

  const items = payload.items ?? [];
  const kpis = dashboard?.kpis ?? {};
  const chart = dashboard?.graficos?.recebimentos ?? [];
  const chartMax = Math.max(...chart.map((row) => Number(row.valor ?? 0)), 1);

  async function execute(path: string, options: RequestInit, success: string) {
    setBusy(true);
    try {
      await fetchAdmin(path, options);
      setToast({ type: 'success', text: success });
      await load();
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' });
    } finally {
      setBusy(false);
    }
  }

  async function syncContests() {
    await execute('/api/v1/admin/concursos/sincronizar', { method: 'POST' }, 'Concursos sincronizados com sucesso.');
  }

  function DashboardView() {
    return <>
      <SectionHeading eyebrow="Visão executiva" title="Operação BL" description="Acompanhe a saúde dos concursos, bolões, cotas e recebimentos em um único centro de gestão." action={<div className="admin-heading-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período do dashboard"><option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="mes">Este mês</option></select><button className="admin-button admin-button-primary" onClick={syncContests} disabled={busy}>Sincronizar concursos</button></div>} />
      <div className="admin-kpi-grid"><Kpi label="Usuários" value={kpis.usuarios ?? 0} hint="contas cadastradas" /><Kpi label="Bolões abertos" value={kpis.boloesAbertos ?? 0} hint={`${kpis.boloesFechados ?? 0} fechados`} tone="violet" /><Kpi label="Cotas pagas" value={kpis.cotasPagas ?? 0} hint={`${kpis.cotasReservadas ?? 0} reservadas`} tone="green" /><Kpi label="Arrecadação" value={money(kpis.arrecadacao)} hint="período selecionado" tone="amber" /><Kpi label="Comissões pendentes" value={money(kpis.comissoesPendentes)} hint={`${kpis.afiliadosAtivos ?? 0} afiliados ativos`} tone="rose" /></div>
      <div className="admin-dashboard-grid">
        <Panel title="Recebimentos por período" description="Valor bruto confirmado no intervalo selecionado" className="admin-panel-chart"><div className="admin-chart">{chart.length ? chart.slice(-14).map((row) => <div className="admin-chart-column" key={row.data}><span>{money(row.valor)}</span><div style={{ height: `${Math.max(8, (Number(row.valor ?? 0) / chartMax) * 100)}%` }} /><small>{String(row.data).slice(5).replace('-', '/')}</small></div>) : <Empty title="Sem recebimentos no período" description="Quando houver pagamentos Pix confirmados, a evolução aparecerá aqui." />}</div></Panel>
        <Panel title="Próximos cutoffs" description="Fila de atenção operacional" action={<Link href="/admin?view=operacao" className="admin-text-link">Ver fila</Link>}><div className="admin-list">{(dashboard?.proximosCutoffs ?? []).length ? dashboard!.proximosCutoffs!.map((row) => <div className="admin-list-row" key={row.id}><div><strong>{modalityNames[row.modalidade] ?? row.modalidade} · concurso {row.concurso}</strong><span>{row.cotas ?? 0} cotas registradas</span></div><time>{dateTime(row.cutoffAt)}</time></div>) : <Empty title="Fila vazia" description="Nenhum bolão aberto ou fechado aguardando cutoff." />}</div></Panel>
      </div>
      <div className="admin-dashboard-grid admin-dashboard-grid-three"><Panel title="Status dos bolões" description="Distribuição por lifecycle"><div className="admin-summary-list"><div><span>Rascunhos</span><strong>{kpis.boloesRascunho ?? 0}</strong></div><div><span>Abertos</span><strong>{kpis.boloesAbertos ?? 0}</strong></div><div><span>Registrados</span><strong>{kpis.boloesRegistrados ?? 0}</strong></div><div><span>Apurados</span><strong>{kpis.boloesApurados ?? 0}</strong></div></div></Panel><Panel title="Disponibilidade de cotas" description="Controle de estoque operacional"><div className="admin-summary-list"><div><span>Disponíveis</span><strong>{kpis.cotasDisponiveis ?? 0}</strong></div><div><span>Reservadas</span><strong>{kpis.cotasReservadas ?? 0}</strong></div><div><span>Pagas</span><strong>{kpis.cotasPagas ?? 0}</strong></div><div><span>Premiadas</span><strong>{kpis.cotasPremiadas ?? 0}</strong></div></div></Panel><Panel title="Resultado financeiro" description="Valores confirmados"><div className="admin-summary-list"><div><span>Custo dos jogos</span><strong>{money(kpis.custoJogos)}</strong></div><div><span>Taxas administrativas</span><strong>{money(kpis.taxasAdministrativas)}</strong></div><div><span>Comissões pagas</span><strong>{money(kpis.comissoesPagas)}</strong></div><div><span>Fila operacional</span><strong>{kpis.filaOperacional ?? 0}</strong></div></div></Panel></div>
    </>;
  }

  function ContestsView() {
    return <><SectionHeading eyebrow="Operação" title="Concursos" description="Concursos sincronizados, prêmios estimados e bolões vinculados." action={<button className="admin-button admin-button-primary" onClick={syncContests} disabled={busy}>Sincronizar agora</button>} /><Panel title="Concursos cadastrados" description={`${payload.pagination?.total ?? items.length} registros encontrados`}><Table minWidth={980}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Sorteio</th><th>Prêmio estimado</th><th>Status</th><th>Bolões</th><th>Sincronizado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{modalityNames[item.modalidade] ?? item.modalidade}</strong></td><td>#{item.numeroConcurso}</td><td>{dateOnly(item.dataSorteio)}</td><td>{money(item.valorEstimadoPremio)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item._count?.boloes ?? 0}</td><td>{dateTime(item.sincronizadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum concurso encontrado" description="Sincronize a base da CAIXA ou ajuste os filtros." />}</Panel></>;
  }

  function PoolsView() {
    return <><SectionHeading eyebrow="Catálogo operacional" title="Bolões" description="Crie, revise, publique e acompanhe o ciclo de cada bolão." /><div className="admin-mini-stats"><span>Total <strong>{items.length}</strong></span><span>Rascunhos <strong>{items.filter((item) => item.status === 'rascunho').length}</strong></span><span>Abertos <strong>{items.filter((item) => item.status === 'aberto').length}</strong></span><span>Fechados <strong>{items.filter((item) => item.status === 'fechado').length}</strong></span></div><Panel title="Criação rápida de bolão" description="Escolha concurso, números, valor e cotas em uma única tela."><SimplePoolWizard contests={contests} groupId={groupId} editPool={editingPool} onCancelEdit={() => setEditingPool(null)} onSuccess={async () => { setEditingPool(null); await load(); }} /></Panel><Panel title="Bolões cadastrados" description="Dados operacionais e disponibilidade de cotas"><Table minWidth={1260}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas</th><th>Reservadas</th><th>Pagas</th><th>Disponíveis</th><th>Valor cota</th><th>Receita prevista</th><th>Cutoff</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.concurso?.modalidade] ?? item.concurso?.modalidade ?? '—'}</td><td>#{item.concurso?.numeroConcurso ?? '—'}</td><td>{item.indicadores?.jogos ?? item.jogos?.length ?? 0}</td><td>{item.cotasIlimitadas ? 'Ilimitadas' : item.totalCotas ?? 0}</td><td>{item.indicadores?.reservadas ?? 0}</td><td>{item.indicadores?.pagas ?? 0}</td><td><strong>{item.cotasIlimitadas ? 'Ilimitadas' : item.indicadores?.disponiveis ?? 0}</strong></td><td>{money(item.valorCota)}</td><td>{money(item.indicadores?.receitaPrevista)}</td><td>{dateTime(item.concurso?.cutoffAt)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td><div className="admin-row-actions"><Link className="admin-text-link" href={`/boloes/${item.id}`}>Ver</Link>{['rascunho', 'aberto'].includes(item.status) && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setEditingPool(item)}>Editar</button>}<button className="admin-button admin-button-small admin-button-ghost" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/duplicar`, { method: 'POST' }, 'Bolão duplicado como rascunho.')}>Duplicar</button>{item.status === 'rascunho' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/publicar`, { method: 'POST' }, 'Bolão publicado.')}>Publicar</button>}{item.status === 'aberto' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/fechar`, { method: 'POST' }, 'Bolão fechado.')}>Fechar</button>}{!['registrado', 'apurado', 'cancelado'].includes(item.status) && <button className="admin-text-button" onClick={() => { if (window.confirm('Cancelar este bolão?')) void execute(`/api/v1/admin/boloes/${item.id}`, { method: 'DELETE' }, 'Bolão cancelado.'); }}>Cancelar</button>}</div></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum bolão cadastrado" description="Use a criação rápida acima para cadastrar o primeiro bolão." />}</Panel></>;
  }

  function SharesView() {
    return <><SectionHeading eyebrow="Participações" title="Cotas" description="Reservas, pagamentos, expirações e vínculo de afiliados." /><Panel title="Cotas e reservas"><Table minWidth={1180}><thead><tr><th>Titular</th><th>Bolão</th><th>Concurso</th><th>Quantidade</th><th>Valor</th><th>Status</th><th>Afiliado</th><th>Reserva</th><th>Pagamento</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.titularNome}</strong><small>{item.titularCpf}</small></td><td>{item.bolao?.id?.slice(0, 8) ?? '—'}</td><td>{item.bolao?.concurso?.numeroConcurso ?? '—'}</td><td>{item.quantidade}</td><td>{money(item.valorPago)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.afiliadoReferencia?.codigoAfiliado ?? 'Orgânico'}</td><td>{dateTime(item.expiraReservaEm)}</td><td>{item.pagamento ? <span className={statusClass(item.pagamento.status)}>{statusLabel(item.pagamento.status)}</span> : '—'}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma cota encontrada" description="As reservas e pagamentos aparecerão nesta fila assim que existirem." />}</Panel></>;
  }

  function PaymentsView() {
    const title = view === 'pagamentos' ? 'Pagamentos' : 'Recebimentos';
    return <><SectionHeading eyebrow="Financeiro" title={title} description="Acompanhe somente o método Pix, único provider habilitado no runtime atual." /><div className="admin-kpi-grid admin-kpi-grid-four"><Kpi label="Confirmados" value={items.filter((item) => item.status === 'confirmado').length} tone="green" /><Kpi label="Pendentes" value={items.filter((item) => item.status === 'pendente').length} tone="amber" /><Kpi label="Falhos" value={items.filter((item) => item.status === 'falhou').length} tone="rose" /><Kpi label="Estornados" value={items.filter((item) => item.status === 'estornado').length} /></div><Panel title="Transações Pix"><Table minWidth={1220}><thead><tr><th>Data</th><th>Transação</th><th>Usuário</th><th>Cota</th><th>Método</th><th>Valor</th><th>Taxa</th><th>Comissão</th><th>Provedor</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><code>{item.pspTransactionId ?? item.id?.slice(0, 8)}</code></td><td>{item.cota?.comprador?.nome ?? '—'}</td><td>{item.cotaId?.slice(0, 8)}</td><td>Pix</td><td>{money(item.valorBruto)}</td><td>{money(item.valorTaxaAdmin)}</td><td>{money(item.valorComissaoAfiliado)}</td><td>{item.pspProvedor}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum recebimento" description="As transações Pix aparecerão após a criação de pagamentos." />}</Panel></>;
  }

  function GamesView() {
    const games = items.flatMap((pool) => (pool.jogos ?? []).map((game: RecordValue) => ({ ...game, pool })));
    return <><SectionHeading eyebrow="Operação" title="Jogos / apostas" description="Visão auditável dos jogos que compõem cada bolão, com números, custo e status." /><Panel title="Jogos cadastrados" description={`${games.length} jogos carregados nos bolões filtrados`}><Table minWidth={980}><thead><tr><th>Bolão</th><th>Modalidade</th><th>Concurso</th><th>Ordem</th><th>Números</th><th>Dezenas</th><th>Custo</th><th>Status</th></tr></thead><tbody>{games.map((game) => <tr key={game.id}><td><code>{game.pool.id?.slice(0, 8)}</code></td><td>{modalityNames[game.pool.concurso?.modalidade] ?? game.pool.concurso?.modalidade ?? '—'}</td><td>#{game.pool.concurso?.numeroConcurso ?? '—'}</td><td>Jogo {String(game.ordem).padStart(3, '0')}</td><td><strong>{(game.numeros ?? []).map((number: number) => String(number).padStart(2, '0')).join(' · ') || game.pool.numerosApostados?.join(' · ') || '—'}</strong></td><td>{game.quantidadeDezenas ?? game.numeros?.length ?? 0}</td><td>{money(game.custo)}</td><td><span className={statusClass(game.status)}>{statusLabel(game.status)}</span></td></tr>)}</tbody></Table>{!games.length && <Empty title="Nenhum jogo carregado" description="Crie um bolão com jogos múltiplos para acompanhar esta visão operacional." />}</Panel></>;
  }

  function ParticipantsView() {
    return <><SectionHeading eyebrow="Relacionamento" title="Participantes" description="Participantes únicos derivados das cotas, com volume e estado de participação." /><Panel title="Participantes e cotas"><Table minWidth={900}><thead><tr><th>Participante</th><th>CPF protegido</th><th>Cotas</th><th>Bolão</th><th>Valor</th><th>Status</th><th>Afiliado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.titularNome}</strong><small>{item.comprador?.email ?? '—'}</small></td><td>{item.titularCpf}</td><td>{item.quantidade}</td><td><code>{item.bolao?.id?.slice(0, 8) ?? '—'}</code></td><td>{money(item.valorPago)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.afiliadoReferencia?.codigoAfiliado ?? 'Orgânico'}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum participante encontrado" description="As participações aparecerão aqui com paginação e filtros." />}</Panel></>;
  }

  function ReceiptsView() {
    return <><SectionHeading eyebrow="Operação" title="Comprovantes" description="Vincule e acompanhe os comprovantes dos bolões registrados pela operação." /><Panel title="Comprovantes de bolão"><Table minWidth={980}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas pagas</th><th>Cutoff</th><th>Status</th><th>Comprovante</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>#{item.concurso}</td><td>{item.jogos}</td><td>{item.cotasPagas}</td><td>{dateTime(item.cutoffAt)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.comprovanteUrl ? <a className="admin-text-link" href={item.comprovanteUrl} target="_blank" rel="noreferrer">Abrir</a> : 'Pendente'}</td><td><button className="admin-button admin-button-small" onClick={() => { const url = window.prompt('URL do comprovante do bolão:', item.comprovanteUrl ?? ''); if (url) void execute(`/api/v1/admin/operacao/boloes/${item.id}/comprovante`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comprovanteUrl: url }) }, 'Comprovante vinculado.'); }}>Vincular</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum comprovante" description="Comprovantes vinculados ou pendentes aparecerão nesta fila." />}</Panel></>;
  }

  function AffiliatesView() {
    return <><SectionHeading eyebrow="Relacionamento" title="Afiliados" description="Aprovação, comissão padrão, atribuição e desempenho da rede." /><div className="admin-management-grid"><ManagedUserForm mode="affiliate" affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><InviteManager affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /></div><Panel title="Afiliados cadastrados"><Table minWidth={1240}><thead><tr><th>Afiliado</th><th>Código</th><th>Status</th><th>Pai</th><th>Diretos</th><th>Usuários</th><th>Grupos</th><th>Cotas</th><th>Comissão</th><th>Pendente</th><th>Pago</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.usuario?.nome}</strong><small>{item.usuario?.email}</small></td><td><code>{item.codigoAfiliado}</code></td><td><span className={statusClass(item.statusAprovacao)}>{statusLabel(item.statusAprovacao)}</span></td><td>{item.parentAfiliado?.usuario?.nome ?? 'Raiz'}</td><td>{item.indicadores?.indicados ?? 0}</td><td>{item.indicadores?.usuariosIndicados ?? 0}</td><td>{item.indicadores?.grupos ?? 0}</td><td>{item.indicadores?.cotas ?? 0}</td><td>{item.comissaoPadraoPct}%</td><td>{money(item.indicadores?.pendente)}</td><td>{money(item.indicadores?.paga)}</td><td><div className="admin-row-actions">{item.statusAprovacao !== 'aprovado' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/afiliados/${item.id}/aprovar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoPadraoPct: Number(item.comissaoPadraoPct ?? 10) }) }, 'Afiliado aprovado e papel atualizado.')}>Aprovar</button>}<button className="admin-button admin-button-small admin-button-ghost" onClick={() => { const value = window.prompt('Nova comissão percentual:', String(item.comissaoPadraoPct ?? 10)); if (value !== null) void execute(`/api/v1/admin/afiliados/${item.id}/comissao`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoPadraoPct: Number(value) }) }, 'Comissão atualizada.'); }}>Alterar %</button></div></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum afiliado" description="Crie um afiliado ou gere um convite para iniciar a rede." />}</Panel></>;
  }

  function NetworkView() {
    return <><SectionHeading eyebrow="Relacionamento" title="Rede de afiliados" description="Monte a hierarquia, altere o afiliado-pai e acompanhe os indicadores de cada nível." /><Panel title="Árvore operacional"><AffiliateNetworkTable affiliates={items as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /></Panel></>;
  }

  function InvitesView() {
    return <><SectionHeading eyebrow="Aquisição" title="Convites" description="Gere links rastreáveis para usuários participantes e afiliados da rede." /><InviteManager affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><Panel title="Convites emitidos"><Table minWidth={900}><thead><tr><th>Código</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Status</th><th>Expiração</th><th>Link</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.codigo}</code></td><td>{item.tipo === 'afiliado' ? 'Afiliado' : 'Usuário'}</td><td>{item.afiliadoOrigem?.codigoAfiliado ?? 'Raiz'}</td><td>{item.emailDestino ?? 'Livre'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{dateTime(item.expiraEm)}</td><td>{item.caminho ? <button className="admin-text-button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${item.caminho}`)}>Copiar link</button> : '—'}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum convite" description="Gere um link acima para iniciar aquisição rastreável." />}</Panel></>;
  }

  function GroupsView() {
    return <><SectionHeading eyebrow="Estrutura" title="Grupos" description="Crie grupos oficiais ou vincule comunidades aos afiliados aprovados." /><Panel title="Novo grupo"><AdminGroupForm affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /></Panel><Panel title="Grupos cadastrados"><Table minWidth={850}><thead><tr><th>Grupo</th><th>Slug</th><th>Proprietário</th><th>Bolões</th><th>Criado em</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong><small>{item.descricao ?? 'Sem descrição'}</small></td><td><code>/{item.slug}</code></td><td>{item.afiliado?.usuario?.nome ?? 'BL oficial'}</td><td>{item._count?.boloes ?? 0}</td><td>{dateOnly(item.criadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum grupo" description="Crie o primeiro grupo oficial ou de afiliado." />}</Panel></>;
  }

  function CommissionsView() {
    const toggle = (id: string) => setSelectedCommissions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    return <><SectionHeading eyebrow="Financeiro" title="Comissões" description="Comissões idempotentes, geradas somente após confirmação de pagamento." action={<Link href="/admin?view=repasses" className="admin-button admin-button-primary">Gerenciar repasses</Link>} /><Panel title="Comissões pendentes e pagas" action={selectedCommissions.length > 0 ? <button className="admin-button admin-button-primary" onClick={() => execute('/api/v1/admin/repasses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoIds: selectedCommissions }) }, 'Lote de repasse criado.')}>Criar lote ({selectedCommissions.length})</button> : undefined}><Table minWidth={1120}><thead><tr><th><input type="checkbox" aria-label="Selecionar todas" onChange={(event) => setSelectedCommissions(event.target.checked ? items.filter((item) => item.status === 'pendente').map((item) => item.id) : [])} /></th><th>Afiliado</th><th>Cota</th><th>Bolão</th><th>Base</th><th>%</th><th>Comissão</th><th>Status</th><th>Data</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><input type="checkbox" checked={selectedCommissions.includes(item.id)} disabled={item.status !== 'pendente'} onChange={() => toggle(item.id)} aria-label={`Selecionar comissão ${item.id}`} /></td><td>{item.afiliado?.usuario?.nome ?? item.afiliado?.codigoAfiliado}</td><td>{item.cotaId?.slice(0, 8)}</td><td>{item.cota?.bolao?.concurso?.numeroConcurso ? `Concurso ${item.cota.bolao.concurso.numeroConcurso}` : '—'}</td><td>{money(item.baseCalculo)}</td><td>{item.percentual ?? '—'}%</td><td>{money(item.valor)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{dateTime(item.criadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma comissão" description="As comissões serão geradas quando uma cota atribuída for paga." />}</Panel></>;
  }

  function RemittancesView() {
    return <><SectionHeading eyebrow="Financeiro" title="Repasses" description="Registre lotes manuais de repasse via Pix com histórico e auditoria." /><Panel title="Lotes de repasse"><Table minWidth={980}><thead><tr><th>Código</th><th>Comissões</th><th>Valor total</th><th>Data</th><th>Referência</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.codigo}</code></td><td>{item.comissoes?.length ?? 0}</td><td>{money(item.valorTotal)}</td><td>{dateOnly(item.dataRepasse)}</td><td>{item.referencia ?? '—'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.status !== 'pago' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/repasses/${item.id}/pagar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referencia: window.prompt('Referência do comprovante:', '') || undefined }) }, 'Repasse marcado como pago e comissões atualizadas.')}>Registrar pagamento</button>}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum lote de repasse" description="Selecione comissões pendentes na aba Comissões para gerar um lote." />}</Panel></>;
  }

  function UsersView() {
    return <><SectionHeading eyebrow="Governança" title="Usuários" description="Contas, papéis, KYC e histórico de participação." /><ManagedUserForm mode="user" onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><Panel title="Contas cadastradas"><Table minWidth={1120}><thead><tr><th>Usuário</th><th>CPF</th><th>Papel</th><th>Afiliado</th><th>KYC</th><th>Cadastro</th><th>Participações</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong><small>{item.email}</small></td><td>{item.cpf}</td><td><span className="status-chip">{item.papel}</span></td><td>{item.afiliado?.codigoAfiliado ?? '—'}</td><td><span className={statusClass(item.statusKyc)}>{statusLabel(item.statusKyc)}</span></td><td>{dateOnly(item.criadoEm)}</td><td>{item._count?.cotasCompradas ?? 0}</td><td><select className="admin-inline-select" value={item.papel} onChange={(event) => execute(`/api/v1/admin/usuarios/${item.id}/papel`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ papel: event.target.value }) }, 'Papel do usuário atualizado.')}><option value="cotista">Cotista</option><option value="afiliado">Afiliado</option><option value="operacao">Operação</option><option value="admin">Admin</option></select></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum usuário" description="Use o cadastro interno acima ou o link de convite." />}</Panel></>;
  }

  function OperationView() {
    return <><SectionHeading eyebrow="Operação" title="Fila operacional" description="Bolões próximos do cutoff, aguardando registro ou comprovante." /><Panel title="Fila de registro"><Table minWidth={1120}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas pagas</th><th>Arrecadação</th><th>Cutoff</th><th>Parceiro</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>#{item.concurso}</td><td>{item.jogos}</td><td>{item.cotasPagas}</td><td>{money(item.arrecadacao)}</td><td>{dateTime(item.cutoffAt)}</td><td>{item.parceiro ?? 'Mandato'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td><button className="admin-button admin-button-small" onClick={() => { const url = window.prompt('URL do comprovante do bolão:'); if (url) void execute(`/api/v1/admin/operacao/boloes/${item.id}/comprovante`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comprovanteUrl: url }) }, 'Comprovante vinculado e cotas pagas registradas.'); }}>Comprovante</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Fila operacional vazia" description="Nenhum bolão aguarda registro neste momento." />}</Panel></>;
  }

  function PartnersView() {
    return <><SectionHeading eyebrow="Rede operacional" title="Lotéricas parceiras" description="Parceiros de registro separados dos afiliados comerciais." /><Panel title="Parceiros cadastrados"><Table minWidth={950}><thead><tr><th>Razão social</th><th>CNPJ</th><th>Código Caixa</th><th>Cidade/UF</th><th>Repasse</th><th>Operador</th><th>Bolões</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.razaoSocial}</strong></td><td>{item.cnpj}</td><td>{item.codigoCaixa ?? '—'}</td><td>{item.cidade}/{item.uf}</td><td>{item.percentualRepasse}%</td><td>{item.usuarioOperacional?.nome ?? '—'}</td><td>{item._count?.boloes ?? 0}</td><td><span className={statusClass(item.statusContrato)}>{statusLabel(item.statusContrato)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma lotérica parceira" description="Cadastre uma parceira pela API administrativa para acompanhar os vínculos aqui." />}</Panel></>;
  }

  function AuditView() {
    return <><SectionHeading eyebrow="Governança" title="Auditoria" description="Registro somente leitura das ações sensíveis do sistema." /><Panel title="Eventos registrados"><Table minWidth={1080}><thead><tr><th>Data</th><th>Evento</th><th>Entidade</th><th>ID</th><th>Ator</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><span className="status-chip">{item.evento}</span></td><td>{item.entidade}</td><td><code>{item.entidadeId?.slice(0, 10)}</code></td><td>{item.ator?.nome ?? 'Sistema'}</td><td><details><summary>Ver</summary><pre>{JSON.stringify(item.payloadAntes ?? null, null, 2)}</pre></details></td><td><details><summary>Ver</summary><pre>{JSON.stringify(item.payloadDepois ?? null, null, 2)}</pre></details></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum evento" description="Ações administrativas e financeiras auditadas aparecerão nesta tabela." />}</Panel></>;
  }

  function SettingsView() {
    const [reserveMinutes, setReserveMinutes] = useState('15');
    const [commission, setCommission] = useState('10');
    return <><SectionHeading eyebrow="Governança" title="Configurações" description="Parâmetros operacionais preparados para evolução segura, sem expor segredos do ambiente." /><div className="admin-settings-grid"><Panel title="Reserva e comissionamento" description="Altere somente valores operacionais validados."><div className="admin-form-grid"><label className="admin-field"><span>Prazo de reserva (minutos)</span><input type="number" min="1" max="60" value={reserveMinutes} onChange={(event) => setReserveMinutes(event.target.value)} /></label><label className="admin-field"><span>Comissão padrão (%)</span><input type="number" min="0" max="100" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} /></label></div><button className="admin-button admin-button-primary" onClick={() => execute('/api/v1/admin/configuracoes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prazoReservaMinutos: Number(reserveMinutes), comissaoPadraoPct: Number(commission) }) }, 'Configuração registrada na auditoria.')}>Salvar parâmetros</button></Panel><Panel title="Pagamentos" description="O runtime atual suporta Pix em modo configurável; cartão e boleto não são anunciados."><div className="admin-callout"><strong>Pix como único método disponível</strong><p>Provider, credenciais e modo teste continuam controlados por variáveis do ambiente de produção. Nenhum segredo é editável nesta tela.</p></div></Panel></div></>;
  }

  function renderView() {
    if (view === 'visao-geral') return <DashboardView />;
    if (view === 'concursos') return <ContestsView />;
    if (view === 'boloes') return <PoolsView />;
    if (view === 'jogos') return <GamesView />;
    if (view === 'cotas') return <SharesView />;
    if (view === 'participantes') return <ParticipantsView />;
    if (view === 'recebimentos' || view === 'pagamentos') return <PaymentsView />;
    if (view === 'afiliados') return <AffiliatesView />;
    if (view === 'rede') return <NetworkView />;
    if (view === 'convites') return <InvitesView />;
    if (view === 'grupos') return <GroupsView />;
    if (view === 'comissoes') return <CommissionsView />;
    if (view === 'repasses') return <RemittancesView />;
    if (view === 'usuarios') return <UsersView />;
    if (view === 'operacao') return <OperationView />;
    if (view === 'comprovantes') return <ReceiptsView />;
    if (view === 'lotericas') return <PartnersView />;
    if (view === 'auditoria') return <AuditView />;
    if (view === 'configuracoes') return <SettingsView />;
    return <DashboardView />;
  }

  return <AdminShell>{viewsWithTables.has(view) && <div className="admin-toolbar"><div className="admin-toolbar-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="Buscar neste módulo…" aria-label="Buscar" /></div><div className="admin-toolbar-filters"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option value="">Todos os status</option><option value="aberto">Aberto</option><option value="fechado">Fechado</option><option value="pendente">Pendente</option><option value="paga">Paga</option><option value="confirmado">Confirmado</option><option value="aprovado">Aprovado</option></select><button className="admin-button admin-button-ghost" onClick={() => void load()}>Atualizar</button></div></div>}{toast && <div className={`admin-toast ${toast.type === 'error' ? 'admin-toast-error' : ''}`}>{toast.text}</div>}{loading ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando dados do centro de gestão…</p></div> : renderView()}</AdminShell>;
}

function PoolWizard({ contests, groupId, onSuccess }: { contests: RecordValue[]; groupId: string | null; onSuccess: () => Promise<void> | void }) {
  const [step, setStep] = useState(1);
  const [modality, setModality] = useState('megasena');
  const [contestId, setContestId] = useState('');
  const [games, setGames] = useState<GameDraft[]>([{ ordem: 1, numeros: [], custo: '0' }]);
  const [totalCotas, setTotalCotas] = useState('10');
  const [valorCota, setValorCota] = useState('20');
  const [taxa, setTaxa] = useState('10');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const limits = modalityLimits[modality] ?? modalityLimits.megasena!;
  const availableContests = contests.filter((contest) => contest.modalidade === modality && ['aberto', 'aberta'].includes(String(contest.status).toLowerCase()));
  const selectedContest = contests.find((contest) => contest.id === contestId);
  const totalGameCost = games.reduce((sum, game) => sum + Number(game.custo || 0), 0);
  const predictedRevenue = Number(totalCotas || 0) * Number(valorCota || 0);
  const predictedFee = predictedRevenue * Number(taxa || 0) / 100;

  useEffect(() => { if (!contestId && availableContests[0]) setContestId(availableContests[0].id); }, [availableContests, contestId]);

  function updateGame(index: number, data: Partial<GameDraft>) { setGames((current) => current.map((game, gameIndex) => gameIndex === index ? { ...game, ...data } : game)); }
  function toggleNumber(index: number, number: number) { const game = games[index]!; const numbers = game.numeros.includes(number) ? game.numeros.filter((value) => value !== number) : [...game.numeros, number].sort((a, b) => a - b); updateGame(index, { numeros: numbers }); }
  function addGame() { setGames((current) => [...current, { ordem: current.length + 1, numeros: [], custo: '0' }]); }
  function removeGame(index: number) { if (games.length === 1) return; setGames((current) => current.filter((_, gameIndex) => gameIndex !== index).map((game, gameIndex) => ({ ...game, ordem: gameIndex + 1 }))); }
  function validateStep() {
    setMessage('');
    if (step === 1 && !modality) return setMessage('Selecione uma modalidade.');
    if (step === 2 && !contestId) return setMessage('Selecione um concurso aberto.');
    if (step === 3 && games.some((game) => game.numeros.length < limits.min)) return setMessage(`Cada jogo precisa de pelo menos ${limits.min} números.`);
    if (step === 4 && (Number(totalCotas) < 1 || Number(valorCota) <= 0 || Number(taxa) < 0)) return setMessage('Revise cotas, valor e taxa administrativa.');
    setStep((current) => Math.min(5, current + 1));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!groupId || !selectedContest) { setMessage('Grupo oficial ou concurso não encontrado.'); return; }
    setSaving(true);
    try {
      const response = await authFetch('/api/v1/admin/boloes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ concursoId: contestId, grupoId: groupId, numerosApostados: games[0]?.numeros ?? [], jogos: games.map((game) => ({ ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.numeros.length, custo: Number(game.custo || 0) })), totalCotas: Number(totalCotas), valorCota: Number(valorCota), taxaAdministracaoPct: Number(taxa), modeloOperacional: 'mandato', descricao: description || undefined }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || 'Não foi possível criar o bolão.');
      setMessage('Bolão criado com sucesso.');
      await onSuccess();
      setStep(1); setGames([{ ordem: 1, numeros: [], custo: '0' }]); setDescription('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar bolão.'); }
    finally { setSaving(false); }
  }

  return <form className="pool-wizard" onSubmit={submit}><div className="wizard-steps">{['Modalidade', 'Concurso', 'Jogos', 'Cotas', 'Revisão'].map((label, index) => <div key={label} className={`wizard-step ${step === index + 1 ? 'is-current' : ''} ${step > index + 1 ? 'is-done' : ''}`}><span>{index + 1}</span>{label}</div>)}</div>{message && <div className="admin-callout admin-callout-warning">{message}</div>}{step === 1 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 1</span><h3>Escolha a modalidade</h3><p>A modalidade define a faixa de números e o concurso disponível.</p></div><div className="modality-picker">{Object.entries(modalityNames).map(([key, label]) => <button type="button" key={key} className={modality === key ? 'is-selected' : ''} onClick={() => { setModality(key); setContestId(''); }}><strong>{label}</strong><small>{modalityLimits[key]?.min} números mínimos</small></button>)}</div></div>}{step === 2 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 2</span><h3>Selecione o concurso</h3><p>Somente concursos abertos e dentro do cutoff podem receber novos bolões.</p></div><div className="contest-picker">{availableContests.length ? availableContests.map((contest) => <button type="button" key={contest.id} className={contestId === contest.id ? 'is-selected' : ''} onClick={() => setContestId(contest.id)}><span>{modalityNames[contest.modalidade]}</span><strong>Concurso {contest.numeroConcurso}</strong><small>{dateOnly(contest.dataSorteio)} · Prêmio {money(contest.valorEstimadoPremio)}</small></button>) : <Empty title="Nenhum concurso aberto" description="Sincronize os concursos e tente novamente." />}</div></div>}{step === 3 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 3</span><h3>Monte os jogos</h3><p>Adicione quantos jogos forem necessários. Os números serão validados no backend.</p></div><div className="games-builder">{games.map((game, index) => <div className="game-builder-card" key={game.ordem}><div className="game-builder-heading"><strong>Jogo {String(game.ordem).padStart(3, '0')}</strong><button type="button" className="admin-text-button" onClick={() => removeGame(index)} disabled={games.length === 1}>Remover</button></div><div className="number-grid">{Array.from({ length: limits.max }, (_, value) => value + 1).map((number) => <button type="button" key={number} className={game.numeros.includes(number) ? 'is-selected' : ''} onClick={() => toggleNumber(index, number)}>{String(number).padStart(2, '0')}</button>)}</div><div className="game-builder-footer"><span>{game.numeros.length}/{limits.pick} selecionados</span><label>Custo do jogo <input type="number" min="0" step="0.01" value={game.custo} onChange={(event) => updateGame(index, { custo: event.target.value })} /></label></div></div>)}<button type="button" className="admin-button admin-button-ghost" onClick={addGame}>+ Adicionar jogo</button></div></div>}{step === 4 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 4</span><h3>Configure as cotas</h3><p>Defina a capacidade, o valor da cota e a taxa dentro do limite da modalidade.</p></div><div className="admin-form-grid admin-form-grid-three"><label className="admin-field"><span>Total de cotas</span><input type="number" min="1" value={totalCotas} onChange={(event) => setTotalCotas(event.target.value)} /></label><label className="admin-field"><span>Valor da cota (R$)</span><input type="number" min="0.01" step="0.01" value={valorCota} onChange={(event) => setValorCota(event.target.value)} /></label><label className="admin-field"><span>Taxa administrativa (%)</span><input type="number" min="0" max="35" step="0.01" value={taxa} onChange={(event) => setTaxa(event.target.value)} /></label></div><label className="admin-field"><span>Descrição pública</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explique a estratégia, transparência e operação do bolão." /></label></div>}{step === 5 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Revisão</span><h3>Confira antes de publicar</h3><p>O backend recalcula os valores e aplica as validações do concurso.</p></div><div className="wizard-review"><div><span>Modalidade</span><strong>{modalityNames[modality]}</strong></div><div><span>Concurso</span><strong>#{selectedContest?.numeroConcurso ?? '—'}</strong></div><div><span>Jogos</span><strong>{games.length}</strong></div><div><span>Cotas</span><strong>{totalCotas} × {money(valorCota)}</strong></div><div><span>Receita prevista</span><strong>{money(predictedRevenue)}</strong></div><div><span>Taxa prevista</span><strong>{money(predictedFee)}</strong></div><div><span>Custo dos jogos</span><strong>{money(totalGameCost)}</strong></div><div><span>Margem operacional</span><strong>{money(predictedFee - totalGameCost)}</strong></div></div></div>}<div className="wizard-actions">{step > 1 && <button type="button" className="admin-button admin-button-ghost" onClick={() => setStep((current) => current - 1)}>Voltar</button>}{step < 5 ? <button type="button" className="admin-button admin-button-primary" onClick={validateStep}>Continuar</button> : <button className="admin-button admin-button-primary" disabled={saving}>{saving ? 'Criando…' : 'Criar bolão'}</button>}</div></form>;
}

export function AdminDashboard() {
  return <AdminDashboardContent />;
}
