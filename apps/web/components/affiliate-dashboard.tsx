'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type AffiliateData = { id?: string; codigoAfiliado?: string; statusAprovacao?: string; cadastrosAtribuidos?: number; participantes?: number; cotas?: number; volume?: string; comissaoPendente?: string; comissaoPaga?: string; totalComissoes?: number };
type Commission = { id: string; cotaId: string; valor: string; baseCalculo?: string | null; percentual?: string | null; status: string; criadoEm: string; repassadoEm?: string | null };
type Invite = { id: string; codigo: string; tipo: 'usuario' | 'afiliado'; status: string; expiraEm: string; caminho: string };
type Group = { id: string; nome: string; slug: string; descricao?: string | null; _count?: { boloes?: number } };
type Pool = { id: string; grupoId: string; grupo?: { id: string; nome: string; slug: string } | null; status: string; totalCotas: number; cotasVendidas: number; cotasDisponiveis: number; valorCota: string; taxaAdministracaoPct: string; jogos?: Array<{ numeros: number[]; custo: string }>; concurso?: { modalidade: string; numeroConcurso: number; dataSorteio: string; cutoffAt: string; valorEstimadoPremio?: string | null } | null };
type NetworkNode = { id: string; parentAfiliadoId?: string | null; codigoAfiliado: string; statusAprovacao: string; depth: number; usuario: { nome: string; email: string; criadoEm: string }; indicadores: { indicados: number; usuariosIndicados: number; grupos: number; cotasReferenciadas: number } };
type Contest = { id: string; modalidade: string; numeroConcurso: number; dataSorteio: string; cutoffAt: string; valorEstimadoPremio?: string | null; status: string };
type Workspace = { afiliado: AffiliateData; grupos: Group[]; boloes: Pool[]; convites: Invite[] };

const modalityLabels: Record<string, string> = { megasena: 'Mega-Sena', lotofacil: 'Lotofácil', quina: 'Quina', lotomania: 'Lotomania', duplasena: 'Dupla Sena', timemania: 'Timemania', diadesorte: 'Dia de Sorte', supersete: 'Super Sete', loteca: 'Loteca' };
const modalityMinimums: Record<string, number> = { megasena: 6, lotofacil: 15, quina: 5, lotomania: 50, duplasena: 6, timemania: 10, diadesorte: 7, supersete: 7, loteca: 1 };

async function authFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  if (response.status === 401) { window.location.href = '/login?next=/afiliado'; throw new Error('Sessão expirada.'); }
  return response;
}

async function load(path: string, options?: RequestInit) {
  const response = await authFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível concluir a operação.');
  return data;
}

function money(value: unknown) { return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function date(value: unknown) { const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR'); }
function statusText(value: unknown) { return String(value ?? '—').replaceAll('_', ' '); }

export function AffiliateDashboard() {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [network, setNetwork] = useState<{ raiz: NetworkNode | { codigoAfiliado: string; usuario: { nome: string; email: string }; indicadores: Record<string, number> }; descendentes: NetworkNode[]; totalDescendentes: number } | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'visao' | 'rede' | 'grupos' | 'boloes' | 'comissoes'>('visao');
  const [inviteType, setInviteType] = useState<'usuario' | 'afiliado'>('usuario');
  const [groupForm, setGroupForm] = useState({ nome: '', slug: '', descricao: '' });
  const [poolForm, setPoolForm] = useState({ concursoId: '', grupoId: '', numeros: '', totalCotas: '10', valorCota: '20', taxa: '10', custo: '0' });

  async function refresh() {
    const [dashboard, rows, currentWorkspace, currentNetwork, openContests] = await Promise.all([
      load('/api/v1/afiliados/me/dashboard'),
      load('/api/v1/afiliados/me/comissoes'),
      load('/api/v1/afiliados/me/workspace'),
      load('/api/v1/afiliados/me/rede'),
      fetch('/api/v1/concursos?status=aberto').then((response) => response.ok ? response.json() : []),
    ]);
    setData(dashboard); setCommissions(rows); setWorkspace(currentWorkspace); setNetwork(currentNetwork); setContests(Array.isArray(openContests) ? openContests : openContests.items ?? []);
    if (!poolForm.grupoId && currentWorkspace.grupos[0]) setPoolForm((current) => ({ ...current, grupoId: currentWorkspace.grupos[0].id }));
  }

  useEffect(() => { refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar.')); }, []);

  const referralUrl = data?.codigoAfiliado ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${data.codigoAfiliado}` : '';
  const openContests = useMemo(() => contests.filter((contest) => new Date(contest.cutoffAt).getTime() > Date.now()), [contests]);
  const selectedContest = contests.find((contest) => contest.id === poolForm.concursoId);
  const parsedNumbers = poolForm.numeros.split(/[,\s;]+/).map(Number).filter((number) => Number.isInteger(number) && number > 0);

  async function copyText(value: string, label: string) { if (!value) return; await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 2200); }
  async function mutate(path: string, options: RequestInit, success: string) { setBusy(true); setNotice(''); try { await load(path, options); setNotice(success); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao concluir.'); } finally { setBusy(false); } }

  async function createInvite() {
    await mutate('/api/v1/afiliados/me/convites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: inviteType }) }, `Convite de ${inviteType === 'usuario' ? 'usuário' : 'afiliado'} criado.`);
  }
  async function createGroup(event: FormEvent) { event.preventDefault(); await mutate('/api/v1/afiliados/me/grupos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(groupForm) }, 'Grupo criado e vinculado ao seu workspace.'); setGroupForm({ nome: '', slug: '', descricao: '' }); }
  async function createPool(event: FormEvent) {
    event.preventDefault();
    if (!selectedContest || !poolForm.grupoId) { setError('Selecione um grupo e um concurso aberto.'); return; }
    const minimum = modalityMinimums[selectedContest.modalidade] ?? 1;
    if (parsedNumbers.length < minimum) { setError(`Informe pelo menos ${minimum} números para ${modalityLabels[selectedContest.modalidade] ?? selectedContest.modalidade}.`); return; }
    await mutate('/api/v1/afiliados/me/boloes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ concursoId: selectedContest.id, grupoId: poolForm.grupoId, numerosApostados: parsedNumbers, jogos: [{ ordem: 1, numeros: parsedNumbers, quantidadeDezenas: parsedNumbers.length, custo: Number(poolForm.custo || 0) }], totalCotas: Number(poolForm.totalCotas), valorCota: Number(poolForm.valorCota), taxaAdministracaoPct: Number(poolForm.taxa), modeloOperacional: 'mandato' }) }, 'Bolão criado como rascunho no seu workspace.');
  }

  if (error && !data) return <div className="affiliate-error"><strong>Acesso de afiliado indisponível</strong><p>{error}</p><Link className="button button-primary" href="/">Voltar à vitrine</Link></div>;
  if (!data || !workspace) return <div className="affiliate-loading">Carregando seu workspace…</div>;

  const ownPools = workspace.boloes;
  return <div className="affiliate-page">
    <div className="affiliate-heading"><div><span className="overline">Workspace do afiliado</span><h1>Seu negócio, sua rede, seus bolões.</h1><p>Crie oportunidades, convide pessoas e acompanhe tudo que pertence à sua operação.</p></div><span className={`affiliate-status ${data.statusAprovacao}`}>{statusText(data.statusAprovacao)}</span></div>
    {(error || notice) && <div className={`form-message ${error ? 'form-error' : 'form-success'}`} role="status">{error || notice}</div>}
    <nav className="affiliate-tabs" aria-label="Navegação do workspace"><button className={tab === 'visao' ? 'is-active' : ''} onClick={() => setTab('visao')}>Visão geral</button><button className={tab === 'rede' ? 'is-active' : ''} onClick={() => setTab('rede')}>Minha rede</button><button className={tab === 'grupos' ? 'is-active' : ''} onClick={() => setTab('grupos')}>Grupos</button><button className={tab === 'boloes' ? 'is-active' : ''} onClick={() => setTab('boloes')}>Meus bolões</button><button className={tab === 'comissoes' ? 'is-active' : ''} onClick={() => setTab('comissoes')}>Comissões</button></nav>

    {tab === 'visao' && <>
      <section className="affiliate-link-card"><div><span className="overline">Link principal de convite</span><strong>{referralUrl}</strong><small>Use este link para trazer usuários. Convites de afiliado criam um perfil de rede pendente de aprovação.</small></div><div className="affiliate-card-actions"><button className="button button-primary" onClick={() => copyText(referralUrl, 'principal')}>{copied === 'principal' ? 'Link copiado' : 'Copiar link'}</button><button className="button button-secondary" disabled={busy} onClick={() => void createInvite()}>Gerar convite</button></div></section>
      <div className="affiliate-invite-tools"><label><span>Tipo de convite</span><select value={inviteType} onChange={(event) => setInviteType(event.target.value as 'usuario' | 'afiliado')}><option value="usuario">Usuário participante</option><option value="afiliado">Novo afiliado da rede</option></select></label><span className="muted">Cada convite gera um código único, com validade e rastreabilidade.</span></div>
      <div className="affiliate-kpis"><article><span>Cadastros atribuídos</span><strong>{data.cadastrosAtribuidos ?? 0}</strong></article><article><span>Afiliados descendentes</span><strong>{network?.totalDescendentes ?? 0}</strong></article><article><span>Grupos próprios</span><strong>{workspace.grupos.length}</strong></article><article><span>Bolões próprios</span><strong>{ownPools.length}</strong></article><article><span>Volume confirmado</span><strong>{money(data.volume)}</strong></article><article><span>Comissão pendente</span><strong>{money(data.comissaoPendente)}</strong></article></div>
      <div className="affiliate-workspace-grid"><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Atalhos da operação</h2><p>Comece pela ação que precisa executar.</p></div></div><div className="affiliate-action-grid"><button onClick={() => setTab('rede')}><strong>Montar rede</strong><small>Veja descendentes e indicadores.</small></button><button onClick={() => setTab('grupos')}><strong>Criar grupo</strong><small>Organize sua comunidade.</small></button><button onClick={() => setTab('boloes')}><strong>Criar bolão</strong><small>Escolha concurso e cotas.</small></button><button onClick={() => setTab('comissoes')}><strong>Conferir comissões</strong><small>Base, percentual e status.</small></button></div></section><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Convites recentes</h2><p>{workspace.convites.length} convites gerados no workspace.</p></div></div>{workspace.convites.length ? <div className="affiliate-invite-list">{workspace.convites.slice(0, 5).map((invite) => <div key={invite.id}><div><strong>{invite.tipo === 'afiliado' ? 'Afiliado' : 'Usuário'} · {invite.codigo}</strong><small>Expira em {date(invite.expiraEm)} · {statusText(invite.status)}</small></div><button className="text-link" onClick={() => copyText(`${window.location.origin}${invite.caminho}`, invite.id)}>{copied === invite.id ? 'Copiado' : 'Copiar'}</button></div>)}</div> : <div className="affiliate-empty"><strong>Nenhum convite gerado ainda.</strong><p>Crie um convite para começar sua rede.</p></div>}</section></div>
    </>}

    {tab === 'rede' && <section className="affiliate-table-card"><div className="affiliate-card-heading"><div><span className="overline">Relacionamento</span><h2>Minha rede</h2><p>A árvore é criada pelos convites e fica vinculada ao afiliado de origem.</p></div><button className="button button-secondary" onClick={() => void createInvite()}>Novo convite</button></div><div className="affiliate-network-root"><strong>{network?.raiz.usuario.nome}</strong><span>{network?.raiz.codigoAfiliado} · {network?.raiz.indicadores?.indicados ?? 0} afiliados diretos · {network?.raiz.indicadores?.usuariosIndicados ?? 0} usuários</span></div>{network?.descendentes.length ? <div className="affiliate-network-list">{network.descendentes.map((node) => <div className="affiliate-network-node" style={{ marginLeft: `${Math.min(node.depth - 1, 5) * 22}px` }} key={node.id}><span className="network-depth">N{node.depth}</span><div><strong>{node.usuario.nome}</strong><small>{node.codigoAfiliado} · {node.usuario.email}</small></div><div className="network-node-stats"><span>{node.indicadores.indicados} indicados</span><span>{node.indicadores.grupos} grupos</span><span>{node.indicadores.cotasReferenciadas} cotas</span></div><span className={`affiliate-status ${node.statusAprovacao}`}>{statusText(node.statusAprovacao)}</span></div>)}</div> : <div className="affiliate-empty"><strong>Sua rede ainda está vazia.</strong><p>Gere um convite de afiliado para criar o primeiro nó descendente.</p></div>}</section>}

    {tab === 'grupos' && <div className="affiliate-workspace-grid"><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><span className="overline">Organização</span><h2>Criar grupo próprio</h2><p>O grupo ficará vinculado a você e poderá receber seus bolões.</p></div></div><form className="affiliate-form" onSubmit={createGroup}><label>Nome do grupo<input required minLength={2} value={groupForm.nome} onChange={(event) => setGroupForm({ ...groupForm, nome: event.target.value })} /></label><label>Slug público<input required minLength={3} pattern="[a-zA-Z0-9-]+" value={groupForm.slug} onChange={(event) => setGroupForm({ ...groupForm, slug: event.target.value })} placeholder="meu-grupo" /></label><label>Descrição<textarea value={groupForm.descricao} onChange={(event) => setGroupForm({ ...groupForm, descricao: event.target.value })} /></label><button className="button button-primary" disabled={busy}>Criar grupo</button></form></section><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Meus grupos</h2><p>{workspace.grupos.length} grupos pertencem a este workspace.</p></div></div>{workspace.grupos.length ? <div className="affiliate-list-cards">{workspace.grupos.map((group) => <article key={group.id}><strong>{group.nome}</strong><small>/{group.slug} · {group._count?.boloes ?? 0} bolões</small><span>{group.descricao || 'Sem descrição'}</span></article>)}</div> : <div className="affiliate-empty"><strong>Nenhum grupo próprio.</strong><p>Crie seu primeiro grupo para separar comunidades e bolões.</p></div>}</section></div>}

    {tab === 'boloes' && <div className="affiliate-workspace-grid"><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><span className="overline">Catálogo próprio</span><h2>Criar bolão</h2><p>O bolão nasce como rascunho, pertence a você e só entra na vitrine depois de publicado.</p></div></div><form className="affiliate-form" onSubmit={createPool}><label>Grupo<select required value={poolForm.grupoId} onChange={(event) => setPoolForm({ ...poolForm, grupoId: event.target.value })}><option value="">Selecione</option>{workspace.grupos.map((group) => <option value={group.id} key={group.id}>{group.nome}</option>)}</select></label><label>Concurso<select required value={poolForm.concursoId} onChange={(event) => setPoolForm({ ...poolForm, concursoId: event.target.value })}><option value="">Selecione um concurso aberto</option>{openContests.map((contest) => <option value={contest.id} key={contest.id}>{modalityLabels[contest.modalidade] ?? contest.modalidade} · #{contest.numeroConcurso} · {money(contest.valorEstimadoPremio)}</option>)}</select></label><label>Números do jogo<input required value={poolForm.numeros} onChange={(event) => setPoolForm({ ...poolForm, numeros: event.target.value })} placeholder="Ex.: 04 12 23 35 44 58" /><small>Separe por espaço, vírgula ou ponto e vírgula.</small></label><div className="affiliate-form-row"><label>Total de cotas<input type="number" min="1" required value={poolForm.totalCotas} onChange={(event) => setPoolForm({ ...poolForm, totalCotas: event.target.value })} /></label><label>Valor da cota<input type="number" min="0.01" step="0.01" required value={poolForm.valorCota} onChange={(event) => setPoolForm({ ...poolForm, valorCota: event.target.value })} /></label></div><div className="affiliate-form-row"><label>Taxa adm. (%)<input type="number" min="0" max="35" step="0.01" required value={poolForm.taxa} onChange={(event) => setPoolForm({ ...poolForm, taxa: event.target.value })} /></label><label>Custo do jogo<input type="number" min="0" step="0.01" value={poolForm.custo} onChange={(event) => setPoolForm({ ...poolForm, custo: event.target.value })} /></label></div><button className="button button-primary" disabled={busy}>Criar bolão como rascunho</button></form></section><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Meus bolões</h2><p>Ações disponíveis somente sobre recursos do seu workspace.</p></div></div>{ownPools.length ? <div className="affiliate-list-cards">{ownPools.map((pool) => <article key={pool.id}><div className="pool-card-topline"><strong>{modalityLabels[pool.concurso?.modalidade ?? ''] ?? pool.concurso?.modalidade ?? 'Loteria'} · #{pool.concurso?.numeroConcurso ?? '—'}</strong><span className={`affiliate-status ${pool.status}`}>{statusText(pool.status)}</span></div><strong>{pool.totalCotas} cotas · {money(pool.valorCota)}</strong><small>{pool.cotasDisponiveis} disponíveis · {pool.jogos?.length ?? 0} jogo(s) · Grupo {pool.grupo?.nome ?? '—'}</small><div className="affiliate-row-actions">{pool.status === 'rascunho' && <button onClick={() => void mutate(`/api/v1/afiliados/me/boloes/${pool.id}/publicar`, { method: 'POST' }, 'Bolão publicado na vitrine.')}>Publicar</button>}{pool.status === 'aberto' && <button onClick={() => void mutate(`/api/v1/afiliados/me/boloes/${pool.id}/fechar`, { method: 'POST' }, 'Bolão fechado.')}>Fechar</button>}<button onClick={() => void mutate(`/api/v1/afiliados/me/boloes/${pool.id}/duplicar`, { method: 'POST' }, 'Bolão duplicado como rascunho.')}>Duplicar</button>{!['registrado', 'apurado', 'cancelado'].includes(pool.status) && <button onClick={() => { if (window.confirm('Cancelar este bolão?')) void mutate(`/api/v1/afiliados/me/boloes/${pool.id}`, { method: 'DELETE' }, 'Bolão cancelado.') }}>Cancelar</button>}</div></article>)}</div> : <div className="affiliate-empty"><strong>Nenhum bolão próprio.</strong><p>Crie um grupo e escolha um concurso para montar o primeiro.</p></div>}</section></div>}

    {tab === 'comissoes' && <section className="affiliate-table-card"><div className="affiliate-card-heading"><div><span className="overline">Financeiro</span><h2>Minhas comissões</h2><p>Valores vinculados a cotas pagas e repasses registrados pelo administrador.</p></div></div><div className="affiliate-kpis compact"><article><span>Pendente</span><strong>{money(data.comissaoPendente)}</strong></article><article><span>Pago</span><strong>{money(data.comissaoPaga)}</strong></article><article><span>Total de registros</span><strong>{commissions.length}</strong></article></div>{commissions.length ? <div className="affiliate-table-scroll"><table><thead><tr><th>Comissão</th><th>Cota</th><th>Base</th><th>Percentual</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead><tbody>{commissions.map((commission) => <tr key={commission.id}><td>{commission.id.slice(0, 8)}</td><td>{commission.cotaId.slice(0, 8)}</td><td>{money(commission.baseCalculo)}</td><td>{commission.percentual ?? '—'}%</td><td><strong>{money(commission.valor)}</strong></td><td><span className="affiliate-status">{statusText(commission.status)}</span></td><td>{date(commission.repassadoEm ?? commission.criadoEm)}</td></tr>)}</tbody></table></div> : <div className="affiliate-empty"><strong>Nenhuma comissão confirmada ainda.</strong><p>Quando uma cota do seu link for paga, ela aparecerá aqui.</p></div>}</section>}
  </div>;
}
