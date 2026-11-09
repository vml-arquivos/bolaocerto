'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AffiliateContract } from './legal-document';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AffiliateSales } from './affiliate-sales';
import { AffiliateCrm } from './affiliate-crm';
import { AffiliatePanelBoard } from './affiliate-panel';
import { AffiliateQuotas } from './affiliate-quotas';
import { AffiliateMore, parseAffiliateTab, type AffiliateTab } from './affiliate-shell';
import { PoolWizard } from './pool-wizard';
import { concursoNo } from '../lib/contest';
import { authenticatedFetch } from '../lib/client-api';
import { formatBRL as money } from '../lib/format';

type AffiliateData = { id?: string; comissaoPadraoPct?: number; codigoAfiliado?: string; statusAprovacao?: string; cadastrosAtribuidos?: number; participantes?: number; cotas?: number; volume?: string; comissaoPendente?: string; comissaoPaga?: string; totalComissoes?: number };
type Commission = { id: string; cotaId: string; valor: string; baseCalculo?: string | null; percentual?: string | null; status: string; criadoEm: string; repassadoEm?: string | null };
type Invite = { id: string; codigo: string; tipo: 'usuario' | 'afiliado'; status: string; expiraEm: string; caminho: string; grupoId?: string | null };
import { PushPrompt } from './push-prompt';
type Group = { id: string; nome: string; slug: string; descricao?: string | null; totalMembros?: number; capacidade?: number; capacidadeExtra?: number; _count?: { boloes?: number } };
type Member = { id: string; nome: string; email: string; entrouEm: string };
type Pool = { id: string; grupoId: string; grupo?: { id: string; nome: string; slug: string } | null; status: string; totalCotas: number | null; cotasIlimitadas?: boolean; cotasVendidas: number; cotasDisponiveis: number | null; valorCota: string; taxaAdministracaoPct: string; jogos?: Array<{ numeros: number[]; custo: string }>; precificacao?: { dezenasPrevistas?: number; jogosPrevistos?: number; costCents?: number } | null; concurso?: { modalidade: string; numeroConcurso: number; dataSorteio: string; cutoffAt: string; valorEstimadoPremio?: string | null; especial?: string | null; nomeEspecial?: string | null; numeroDefinido?: boolean } | null; aprovacao?: { solicitadaEm?: string | null; aprovadoEm?: string | null } | null };
type Contest = { id: string; modalidade: string; numeroConcurso: number; dataSorteio: string; cutoffAt: string; valorEstimadoPremio?: string | null; status: string; especial?: string | null; nomeEspecial?: string | null; numeroDefinido?: boolean };
type Workspace = { afiliado: AffiliateData; grupos: Group[]; boloes: Pool[]; convites: Invite[] };

const modalityLabels: Record<string, string> = { megasena: 'Mega-Sena', lotofacil: 'Lotofácil', quina: 'Quina', lotomania: 'Lotomania', duplasena: 'Dupla Sena', timemania: 'Timemania', diadesorte: 'Dia de Sorte', supersete: 'Super Sete', loteca: 'Loteca' };
const modalityMinimums: Record<string, number> = { megasena: 6, lotofacil: 15, quina: 5, lotomania: 50, duplasena: 6, timemania: 10, diadesorte: 7, supersete: 7, loteca: 1 };

async function authFetch(path: string, options?: RequestInit) {
  const response = await authenticatedFetch(path, options);
  if (response.status === 401) { window.location.href = '/afiliado/entrar'; throw new Error('Sessão expirada.'); }
  return response;
}

async function load(path: string, options?: RequestInit) {
  const response = await authFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível concluir a operação.');
  return data;
}

function date(value: unknown) { const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR'); }
function statusText(value: unknown) { return String(value ?? '—').replaceAll('_', ' '); }

export function AffiliateDashboard() {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<{ groupId: string; list: Member[] } | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingPool, setEditingPool] = useState<Pool | null>(null);
  const router = useRouter();
  const tab = parseAffiliateTab(useSearchParams().get('aba'));
  const setTab = (next: AffiliateTab) => router.push(next === 'visao' ? '/afiliado' : `/afiliado?aba=${next}`, { scroll: true });
  const [inviteGroupId, setInviteGroupId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  // Bolão criado sem números: o afiliado informa os jogos depois, antes do fechamento.
  const [definingPool, setDefiningPool] = useState<Pool | null>(null);
  const [numbersText, setNumbersText] = useState('');
  const [groupForm, setGroupForm] = useState({ nome: '', slug: '', descricao: '' });

  async function refresh() {
    const [dashboard, rows, currentWorkspace, openContests] = await Promise.all([
      load('/api/v1/afiliados/me/dashboard'),
      load('/api/v1/afiliados/me/comissoes'),
      load('/api/v1/afiliados/me/workspace'),
      fetch('/api/v1/concursos?status=aberto').then((response) => response.ok ? response.json() : []),
    ]);
    setData(dashboard); setCommissions(rows); setWorkspace(currentWorkspace); setContests(Array.isArray(openContests) ? openContests : openContests.items ?? []);
  }

  useEffect(() => { refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar.')); }, []);

  const referralUrl = data?.codigoAfiliado ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${data.codigoAfiliado}` : '';
  const openContests = useMemo(() => contests.filter((contest) => new Date(contest.cutoffAt).getTime() > Date.now()), [contests]);
  async function copyText(value: string, label: string) { if (!value) return; await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 2200); }
  const noNumbers = (pool: Pool) => !(pool.jogos?.length) && ['rascunho', 'aberto', 'fechado'].includes(pool.status);
  async function submitNumbers() {
    if (!definingPool) return;
    const jogos = numbersText.trim().split(/\n+/).filter(Boolean).map((line, index) => ({ ordem: index + 1, numeros: line.trim().split(/[\s,;]+/).map(Number) }));
    if (!jogos.length || jogos.some((game) => game.numeros.some((n) => !Number.isInteger(n)))) { setError('Digite um jogo por linha, só com números.'); return; }
    await mutate(`/api/v1/afiliados/me/boloes/${definingPool.id}/numeros`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jogos }) }, 'Números definidos. Quem já comprou foi avisado.');
    setDefiningPool(null); setNumbersText('');
  }
  async function mutate(path: string, options: RequestInit, success: string) { setBusy(true); setNotice(''); try { await load(path, options); setNotice(success); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao concluir.'); } finally { setBusy(false); } }

  async function createInvite() {
    setBusy(true); setNotice(''); setError('');
    try {
      const invite = await load('/api/v1/afiliados/me/convites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'usuario', ...(inviteGroupId ? { grupoId: inviteGroupId } : {}), ...(inviteEmail.trim() ? { emailDestino: inviteEmail.trim() } : {}) }) });
      setNotice(invite.emailEnviado ? `Convite enviado por e-mail para ${invite.emailDestino}.` : inviteEmail.trim() ? 'Convite criado, mas o e-mail não saiu. Copie o link em "Convites recentes" e envie você mesmo.' : inviteGroupId ? 'Convite do grupo criado. Quem entrar por ele passa a fazer parte do grupo.' : 'Convite criado.');
      setInviteEmail('');
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao criar convite.'); }
    finally { setBusy(false); }
  }
  async function showMembers(groupId: string) {
    if (members?.groupId === groupId) { setMembers(null); return; }
    try { const result = await load(`/api/v1/afiliados/me/grupos/${groupId}/membros`); setMembers({ groupId, list: result.membros ?? [] }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao carregar membros.'); }
  }
  async function createGroup(event: FormEvent) { event.preventDefault(); await mutate('/api/v1/afiliados/me/grupos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(groupForm) }, 'Grupo criado e vinculado ao seu workspace.'); setGroupForm({ nome: '', slug: '', descricao: '' }); }

  if (error && !data) return <div className="affiliate-error"><strong>Acesso de afiliado indisponível</strong><p>{error}</p><Link className="button button-primary" href="/">Voltar à vitrine</Link></div>;
  if (!data || !workspace) return <div className="affiliate-loading">Carregando seu workspace…</div>;

  const ownPools = workspace.boloes;
  return <div className="affiliate-page"><PushPrompt audience="afiliado" /><AffiliateContract />
    {tab === 'visao' && <div className="affiliate-heading"><div><span className="overline">Workspace do afiliado</span><h1>Seus grupos, seus bolões, sua comissão.</h1><p>Monte seu grupo, convide pessoas e venda cotas dos bolões aprovados pela administração.</p></div><span className={`affiliate-status ${data.statusAprovacao}`}>{statusText(data.statusAprovacao)}</span></div>}
    {tab !== 'visao' && data.statusAprovacao && data.statusAprovacao !== 'aprovado' && <div className="form-message form-error" role="status">Seu cadastro de afiliado está {statusText(data.statusAprovacao)}. Algumas ações só liberam depois da aprovação da administração.</div>}
    {(error || notice) && <div className={`form-message ${error ? 'form-error' : 'form-success'}`} role="status">{error || notice}</div>}

    {tab === 'visao' && <>
      <section className="affiliate-link-card"><div><span className="overline">Link principal de convite</span><strong>{referralUrl}</strong><small>Quem se cadastra por este link fica ligado a você e entra no seu grupo. Sua comissão é {data.comissaoPadraoPct ?? workspace.afiliado.comissaoPadraoPct ?? 0}% da taxa de administração de cada cota paga. Ela é definida pela administração do BL e fica no seu contrato.</small></div><div className="affiliate-card-actions"><button className="button button-primary" onClick={() => copyText(referralUrl, 'principal')}>{copied === 'principal' ? 'Link copiado' : 'Copiar link'}</button><button className="button button-secondary" disabled={busy} onClick={() => void createInvite()}>Gerar convite</button></div></section>
      <div className="affiliate-invite-tools"><label><span>Convidar para o grupo</span><select value={inviteGroupId} onChange={(event) => setInviteGroupId(event.target.value)}><option value="">Sem grupo (só vínculo comigo)</option>{workspace.grupos.map((group) => <option value={group.id} key={group.id}>{group.nome}</option>)}</select></label><label><span>Mandar por e-mail (opcional)</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="email@da-pessoa.com" /></label><span className="muted">Convite com grupo coloca a pessoa direto no grupo quando ela se cadastra. O tamanho do grupo limita as cotas dos seus bolões.</span></div>
      <div className="affiliate-kpis"><article><span>Cadastros atribuídos</span><strong>{data.cadastrosAtribuidos ?? 0}</strong></article><article><span>Pessoas nos grupos</span><strong>{workspace.grupos.reduce((sum, group) => sum + (group.totalMembros ?? 0), 0)}</strong></article><article><span>Grupos próprios</span><strong>{workspace.grupos.length}</strong></article><article><span>Bolões próprios</span><strong>{ownPools.length}</strong></article><article><span>Receita gerada (vendas pagas)</span><strong>{money(data.volume)}</strong></article><article><span>Meu lucro (comissões)</span><strong>{money(String(Number(data.comissaoPendente ?? 0) + Number(data.comissaoPaga ?? 0)))}</strong></article><article><span>A receber</span><strong>{money(data.comissaoPendente)}</strong></article><article><span>Já recebido</span><strong>{money(data.comissaoPaga)}</strong></article></div>
      <div className="affiliate-workspace-grid"><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Atalhos da operação</h2><p>Comece pela ação que precisa executar.</p></div></div><div className="affiliate-action-grid"><button onClick={() => setTab('grupos')}><strong>Criar grupo</strong><small>Organize e convide sua comunidade.</small></button><button onClick={() => setTab('clientes')}><strong>Meus clientes</strong><small>Funil de vendas e quem chamar agora.</small></button><button onClick={() => setTab('boloes')}><strong>Criar bolão</strong><small>Escolha concurso e cotas.</small></button><button onClick={() => setTab('comissoes')}><strong>Conferir comissões</strong><small>Base, percentual e status.</small></button></div></section><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Convites recentes</h2><p>{workspace.convites.length} convites gerados no workspace.</p></div></div>{workspace.convites.length ? <div className="affiliate-invite-list">{workspace.convites.slice(0, 5).map((invite) => <div key={invite.id}><div><strong>{invite.grupoId ? `Grupo ${workspace.grupos.find((g) => g.id === invite.grupoId)?.nome ?? ''}` : 'Convite'} · {invite.codigo}</strong><small>Expira em {date(invite.expiraEm)} · {statusText(invite.status)}</small></div><button className="text-link" onClick={() => copyText(`${window.location.origin}${invite.caminho}`, invite.id)}>{copied === invite.id ? 'Copiado' : 'Copiar'}</button></div>)}</div> : <div className="affiliate-empty"><strong>Nenhum convite gerado ainda.</strong><p>Crie um convite para trazer pessoas ao seu grupo.</p></div>}</section></div>
    </>}

    {tab === 'grupos' && <div className="affiliate-workspace-grid"><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><span className="overline">Organização</span><h2>Criar grupo próprio</h2><p>O grupo ficará vinculado a você e poderá receber seus bolões.</p></div></div><form className="affiliate-form" onSubmit={createGroup}><label>Nome do grupo<input required minLength={2} value={groupForm.nome} onChange={(event) => setGroupForm({ ...groupForm, nome: event.target.value })} /></label><label>Slug público<input required minLength={3} pattern="[a-zA-Z0-9-]+" value={groupForm.slug} onChange={(event) => setGroupForm({ ...groupForm, slug: event.target.value })} placeholder="meu-grupo" /></label><label>Descrição<textarea value={groupForm.descricao} onChange={(event) => setGroupForm({ ...groupForm, descricao: event.target.value })} /></label><button className="button button-primary" disabled={busy}>Criar grupo</button></form></section><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Meus grupos</h2><p>{workspace.grupos.length} grupos pertencem a este workspace.</p></div></div>{workspace.grupos.length ? <div className="affiliate-list-cards">{workspace.grupos.map((group) => <article key={group.id}><strong>{group.nome}</strong><small>/{group.slug} · {group._count?.boloes ?? 0} bolões</small><span><strong>{group.totalMembros ?? 0}</strong> {(group.totalMembros ?? 0) === 1 ? 'pessoa' : 'pessoas'} · bolões de até <strong>{group.capacidade ?? 0}</strong> cotas</span><small>{group.descricao || 'Sem descrição'}</small><div className="affiliate-row-actions"><button onClick={() => copyText(`${window.location.origin}/grupos/${group.slug}`, `g-${group.id}`)}>{copied === `g-${group.id}` ? 'Link copiado' : 'Copiar página do grupo'}</button><button onClick={() => { setInviteGroupId(group.id); void mutate('/api/v1/afiliados/me/convites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'usuario', grupoId: group.id }) }, 'Convite do grupo criado — veja em Convites recentes.'); }}>Gerar convite do grupo</button><button onClick={() => void showMembers(group.id)}>{members?.groupId === group.id ? 'Ocultar pessoas' : 'Ver pessoas'}</button></div>{members?.groupId === group.id && (members.list.length ? <ul className="group-members">{members.list.map((member) => <li key={member.id}><span>{member.nome}</span><small>{member.email} · desde {date(member.entrouEm)}</small></li>)}</ul> : <small>Ninguém entrou neste grupo ainda.</small>)}</article>)}</div> : <div className="affiliate-empty"><strong>Nenhum grupo próprio.</strong><p>Crie seu primeiro grupo para separar comunidades e bolões.</p></div>}</section></div>}

    {tab === 'boloes' && definingPool && <section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Definir os números do bolão</h2><p>Um jogo por linha, separados por espaço.{definingPool.precificacao?.jogosPrevistos ? ` Este bolão foi criado para ${definingPool.precificacao.jogosPrevistos} ${definingPool.precificacao.jogosPrevistos === 1 ? 'jogo' : 'jogos'}${definingPool.precificacao.dezenasPrevistas ? ` de ${definingPool.precificacao.dezenasPrevistas} números` : ''}: informe exatamente isso.` : ''} Só dá para definir uma vez e antes do fechamento das apostas.</p></div></div><textarea rows={6} value={numbersText} onChange={(event) => setNumbersText(event.target.value)} placeholder="Ex.: 04 12 23 35 44 58 60 01 02" style={{ width: '100%' }} /><div className="affiliate-row-actions" style={{ marginTop: 12 }}><button className="button button-primary" disabled={busy} onClick={() => void submitNumbers()}>{busy ? 'Salvando…' : 'Salvar números'}</button><button onClick={() => { setDefiningPool(null); setNumbersText(''); }}>Cancelar</button></div></section>}
    {tab === 'boloes' && <div className="affiliate-workspace-grid"><section className="affiliate-table-card"><PoolWizard contests={openContests} groups={workspace.grupos} groupId={workspace.grupos[0]?.id ?? null} role="affiliate" editPool={editingPool} onCancelEdit={() => setEditingPool(null)} onSuccess={async () => { setEditingPool(null); await refresh(); }} /></section><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Meus bolões</h2><p>Ações disponíveis somente sobre recursos do seu workspace.</p></div></div>{ownPools.length ? <div className="affiliate-list-cards">{ownPools.map((pool) => <article key={pool.id}><div className="pool-card-topline"><strong>{modalityLabels[pool.concurso?.modalidade ?? ''] ?? pool.concurso?.modalidade ?? 'Loteria'} · {pool.concurso?.nomeEspecial ? `${pool.concurso.nomeEspecial} · ` : ''}{concursoNo(pool.concurso?.numeroConcurso) === 'a definir' ? 'número a definir' : `#${pool.concurso?.numeroConcurso ?? '—'}`}</strong><span className={`affiliate-status ${pool.status}`}>{pool.status === 'rascunho' && pool.aprovacao?.solicitadaEm ? 'aguardando aprovação' : statusText(pool.status)}</span></div><strong>{pool.cotasIlimitadas ? 'Cotas ilimitadas' : `${pool.totalCotas ?? 0} cotas`} · {money(pool.valorCota)}</strong><small>{pool.cotasIlimitadas ? 'Disponibilidade sob demanda' : `${pool.cotasDisponiveis ?? 0} disponíveis`} · {noNumbers(pool) ? `números a definir${pool.precificacao?.jogosPrevistos ? ` (${pool.precificacao.jogosPrevistos} ${pool.precificacao.jogosPrevistos === 1 ? 'jogo' : 'jogos'}${pool.precificacao.dezenasPrevistas ? ` de ${pool.precificacao.dezenasPrevistas} números` : ''})` : ''}` : `${pool.jogos?.length ?? 0} jogo(s)`} · Grupo {pool.grupo?.nome ?? '—'}</small><div className="affiliate-row-actions">{pool.status === 'aberto' && <button onClick={() => void copyText(`${window.location.origin}/r/${data.codigoAfiliado}?bolao=${pool.id}`, `bolao-${pool.id}`)}>{copied === `bolao-${pool.id}` ? 'Link copiado!' : 'Copiar link de venda'}</button>}{['rascunho', 'aberto'].includes(pool.status) && <button onClick={() => setEditingPool(pool)}>Editar</button>}{noNumbers(pool) && <button onClick={() => { setDefiningPool(pool); setNumbersText(''); }}>Definir números</button>}{pool.status === 'rascunho' && !pool.aprovacao?.solicitadaEm && <button onClick={() => void mutate(`/api/v1/afiliados/me/boloes/${pool.id}/publicar`, { method: 'POST' }, 'Pedido enviado. A administração do BL vai analisar e liberar a venda.')}>Pedir aprovação</button>}{pool.status === 'rascunho' && pool.aprovacao?.solicitadaEm && <small>Enviado para a administração em {date(pool.aprovacao.solicitadaEm)}.</small>}{pool.status === 'aberto' && <button onClick={() => void mutate(`/api/v1/afiliados/me/boloes/${pool.id}/fechar`, { method: 'POST' }, 'Bolão fechado.')}>Fechar</button>}<button onClick={() => void mutate(`/api/v1/afiliados/me/boloes/${pool.id}/duplicar`, { method: 'POST' }, 'Bolão duplicado como rascunho.')}>Duplicar</button>{!['registrado', 'apurado', 'cancelado'].includes(pool.status) && <button onClick={() => { if (window.confirm('Cancelar este bolão?')) void mutate(`/api/v1/afiliados/me/boloes/${pool.id}`, { method: 'DELETE' }, 'Bolão cancelado.') }}>Cancelar</button>}</div></article>)}</div> : <div className="affiliate-empty"><strong>Nenhum bolão próprio.</strong><p>Crie um grupo e escolha um concurso para montar o primeiro.</p></div>}</section></div>}

    {tab === 'visao' && <AffiliatePanelBoard />}
    {tab === 'clientes' && <AffiliateCrm />}
    {tab === 'cotas' && <AffiliateQuotas />}
    {tab === 'vendas' && <AffiliateSales />}
    {tab === 'mais' && <AffiliateMore pending={money(data.comissaoPendente)} status={data.statusAprovacao} />}
    {tab === 'comissoes' && <section className="affiliate-table-card"><div className="affiliate-card-heading"><div><span className="overline">Financeiro</span><h2>Minhas comissões</h2><p>Valores vinculados a cotas pagas e repasses registrados pelo administrador.</p></div></div><div className="affiliate-kpis compact"><article><span>Pendente</span><strong>{money(data.comissaoPendente)}</strong></article><article><span>Pago</span><strong>{money(data.comissaoPaga)}</strong></article><article><span>Total de registros</span><strong>{commissions.length}</strong></article></div>{commissions.length ? <div className="affiliate-table-scroll"><table><thead><tr><th>Comissão</th><th>Cota</th><th>Base</th><th>Percentual</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead><tbody>{commissions.map((commission) => <tr key={commission.id}><td>{commission.id.slice(0, 8)}</td><td>{commission.cotaId.slice(0, 8)}</td><td>{money(commission.baseCalculo)}</td><td>{commission.percentual ?? '—'}%</td><td><strong>{money(commission.valor)}</strong></td><td><span className="affiliate-status">{statusText(commission.status)}</span></td><td>{date(commission.repassadoEm ?? commission.criadoEm)}</td></tr>)}</tbody></table></div> : <div className="affiliate-empty"><strong>Nenhuma comissão confirmada ainda.</strong><p>Quando uma cota do seu link for paga, ela aparecerá aqui.</p></div>}</section>}
  </div>;
}
