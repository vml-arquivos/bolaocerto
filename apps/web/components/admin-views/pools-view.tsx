'use client';

import Link from 'next/link';
import { PoolWizard as SimplePoolWizard } from '../pool-wizard';
import { RowMenu } from '../admin-row-menu';
import { modalityNames } from '../../lib/domain';
import { money, dateTime, statusLabel, statusClass, poolForAttachments, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx } from './shared';

export function PoolsView({ ctx }: { ctx: AdminCtx }) {
  const { items, busy, showPoolForm, setShowPoolForm, editingPool, setEditingPool, contests, groupId, setAttachFor, load, execute } = ctx;
  return <><SectionHeading eyebrow="Jogos" title="Bolões" description="Gerencie vendas, jogos e comprovantes por lote." action={<button className="admin-button" onClick={() => setShowPoolForm(value => !value)}>{showPoolForm ? 'Recolher formulário' : '+ Novo bolão'}</button>} /><div className="admin-mini-stats"><span>Total <strong>{items.length}</strong></span><span>Rascunhos <strong>{items.filter((item) => item.status === 'rascunho').length}</strong></span><span>Abertos <strong>{items.filter((item) => item.status === 'aberto').length}</strong></span><span>Fechados <strong>{items.filter((item) => item.status === 'fechado').length}</strong></span></div>{(showPoolForm || editingPool) && <Panel title={editingPool ? "Editar bolão" : "Criar bolão"} description="Escolha o concurso, os números e o valor."><SimplePoolWizard contests={contests} groupId={groupId} editPool={editingPool} onCancelEdit={() => setEditingPool(null)} onContestCreated={async () => { await load(); }} onSuccess={async (created) => { setEditingPool(null); setShowPoolForm(false); await load(); if (created?.id) setAttachFor({ pool: poolForAttachments(created) }); }} /></Panel>}<Panel className="admin-pools-compact" title="Bolões cadastrados" description="Dados desta página. Novos lotes exigem comprovante antes de publicar; cotas e pagamentos antigos permanecem no histórico."><Table minWidth={860}><thead><tr><th>Bolão</th><th>Jogos</th><th>Cotas</th><th>Valor da cota</th><th>Receita prevista</th><th>Fecha em</th><th>Status</th><th className="th-actions">Ações</th></tr></thead><tbody>{items.map((item) => {
    const isDraft = item.status === 'rascunho';
    const pendingApproval = isDraft && Boolean(item.aprovacao?.solicitadaEm);
    const publishLabel = pendingApproval ? 'Aprovar e abrir venda' : 'Publicar';
    const publishDone = pendingApproval ? 'Bolão aprovado e aberto para venda.' : 'Bolão publicado.';
    return <tr key={item.id}>
      <td className="cell-wrap" data-label="Bolão"><strong>{modalityNames[item.concurso?.modalidade] ?? item.concurso?.modalidade ?? '—'}</strong><small>{item.concurso?.nomeEspecial ? `${item.concurso.nomeEspecial} · ` : ''}{item.concurso ? (item.concurso.numeroConcurso > 0 ? `#${item.concurso.numeroConcurso}` : 'número a definir') : '—'}</small></td>
      <td data-label="Jogos">{item.indicadores?.jogos ?? item.jogos?.length ?? 0}</td>
      <td className="cell-wrap" data-label="Cotas"><strong>{item.cotasIlimitadas ? 'Ilimitadas' : `${item.indicadores?.disponiveis ?? 0} livres`}</strong><small>{item.cotasIlimitadas ? 'sem estoque máximo' : `${item.totalCotas ?? 0} no total`} · {item.indicadores?.pagas ?? 0} pagas · {item.indicadores?.reservadas ?? 0} reservadas</small></td>
      <td data-label="Valor da cota">{money(item.valorCota)}</td>
      <td data-label="Receita prevista">{money(item.indicadores?.receitaPrevista)}</td>
      <td className="cell-wrap" data-label="Fecha em">{dateTime(item.concurso?.cutoffAt)}</td>
      <td className="cell-wrap" data-label="Status"><span className={statusClass(item.status)}>{isDraft && pendingApproval ? 'Aguardando aprovação' : statusLabel(item.status)}</span>{item.aprovacao?.aprovadoEm && <small>aprovado pela administração</small>}{item.liberacao?.condicional && <small>{item.liberacao.liberado ? 'cotas liberadas' : `libera com prêmio de ${money(item.liberacao.gatilho)}`}{!item.liberacao.liberado && Number(item.indicadores?.interessados) > 0 ? ` · ${item.indicadores.interessados} pediram aviso` : ''}</small>}</td>
      <td className="td-actions"><div className="row-actions-main">
        {isDraft && <button type="button" className="admin-button admin-button-small admin-button-primary" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/publicar`, { method: 'POST' }, publishDone)}>{publishLabel}</button>}
        {item.status === 'aberto' && <button type="button" className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/fechar`, { method: 'POST' }, 'Bolão fechado.')}>Fechar</button>}
        {!isDraft && item.status !== 'aberto' && <Link className="admin-button admin-button-small admin-button-ghost" href={`/boloes/${item.id}`}>Ver</Link>}
        <RowMenu items={[
          { label: 'Ver página do bolão', href: `/boloes/${item.id}`, hidden: !isDraft && item.status !== 'aberto' ? true : false },
          { label: 'Comprovantes', onClick: () => setAttachFor({ pool: poolForAttachments(item) }), hint: 'Enviar ou ver os arquivos' },
          { label: 'Controle de cotas', href: '/admin?view=controle' },
          { label: 'Editar', onClick: () => setEditingPool(item), hidden: !['rascunho', 'aberto'].includes(item.status) },
          { label: 'Liberar cotas agora', hidden: !(item.liberacao?.condicional && !item.liberacao.liberado && ['aberto', 'rascunho'].includes(item.status)), onClick: () => { if (window.confirm('Liberar as cotas deste bolão agora, sem esperar o prêmio atingir o gatilho?')) void execute(`/api/v1/admin/boloes/${item.id}/liberar`, { method: 'POST' }, 'Cotas liberadas.'); } },
          { label: 'Novo lote (duplicar)', onClick: () => execute(`/api/v1/admin/boloes/${item.id}/duplicar`, { method: 'POST' }, 'Novo lote criado como rascunho. Revise os jogos e publique.') },
          { label: 'Recusar pedido', hidden: !pendingApproval, onClick: () => { const motivo = window.prompt('Por que não aprovar? O afiliado vai receber este recado.'); if (motivo && motivo.trim().length >= 3) void execute(`/api/v1/admin/boloes/${item.id}/recusar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() }) }, 'Pedido recusado. O afiliado foi avisado.'); } },
          { label: 'Cancelar bolão', danger: true, hidden: ['registrado', 'apurado', 'cancelado'].includes(item.status), onClick: () => { if (window.confirm('Cancelar este bolão?')) void execute(`/api/v1/admin/boloes/${item.id}`, { method: 'DELETE' }, 'Bolão cancelado.'); } },
          { label: 'Excluir (sem movimentação)', danger: true, disabled: busy, hidden: ['registrado', 'apurado'].includes(item.status), onClick: () => { if (window.confirm('Excluir definitivamente este bolão sem movimentação? O sistema bloqueia a exclusão se houver qualquer cota ou anexo.')) void execute(`/api/v1/admin/boloes/${item.id}/sem-movimentacao`, { method: 'DELETE' }, 'Bolão excluído.'); } },
        ]} />
      </div></td>
    </tr>;
  })}</tbody></Table>{!items.length && <Empty title="Nenhum bolão cadastrado" description="Use a criação rápida acima para cadastrar o primeiro bolão." />}</Panel></>;
}
