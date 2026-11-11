'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PoolWizard as SimplePoolWizard } from '../pool-wizard';
import { RowMenu } from '../admin-row-menu';
import { modalityNames } from '../../lib/domain';
import { money, dateTime, statusLabel, statusClass, poolForAttachments, fetchAdmin, SectionHeading, Panel, Empty, Table } from './shared';
import { PoolTransferPanel } from './pool-transfer-panel';
import type { AdminCtx } from './shared';

export function PoolsView({ ctx }: { ctx: AdminCtx }) {
  const { items, busy, showPoolForm, setShowPoolForm, editingPool, setEditingPool, contests, groupId, setAttachFor, load, execute, notify } = ctx;
  const [definingPool, setDefiningPool] = useState<Record<string, any> | null>(null);
  const [numbersText, setNumbersText] = useState('');
  const [movingPool, setMovingPool] = useState<Record<string, any> | null>(null);
  const [moveTo, setMoveTo] = useState('');
  async function submitMove() {
    if (!movingPool || !moveTo) { notify('error', 'Escolha o novo concurso.'); return; }
    try {
      await fetchAdmin(`/api/v1/admin/boloes/${movingPool.id}/trocar-concurso`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ concursoId: moveTo }) });
      notify('success', 'Concurso trocado. Revise o bolão e publique de novo, se precisar.');
      setMovingPool(null); setMoveTo(''); await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível trocar o concurso.'); }
  }
  const [definingBusy, setDefiningBusy] = useState(false);
  async function submitNumbers() {
    if (!definingPool) return;
    const jogos = numbersText.trim().split(/\n+/).filter(Boolean).map((line, index) => ({ ordem: index + 1, numeros: line.trim().split(/[\s,;]+/).map(Number) }));
    if (!jogos.length || jogos.some((game) => game.numeros.some((n) => !Number.isInteger(n)))) { notify('error', 'Digite um jogo por linha, só com números.'); return; }
    setDefiningBusy(true);
    try {
      const result = await fetchAdmin(`/api/v1/admin/boloes/${definingPool.id}/numeros`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jogos }) });
      notify('success', result?.aviso ? `Números definidos. ${result.aviso}` : 'Números definidos. Quem já comprou foi avisado.');
      setDefiningPool(null); setNumbersText(''); await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível definir os números.'); }
    finally { setDefiningBusy(false); }
  }
  const noNumbers = (item: Record<string, any>) => !(item.jogos?.length) && !(item.numerosApostados?.length) && ['rascunho', 'aberto', 'fechado'].includes(item.status);
  async function removePool(item: Record<string, any>) {
    try {
      const preview = await fetchAdmin(`/api/v1/admin/boloes/${item.id}/exclusao`);
      if (!preview.podeExcluir) { notify('error', `Não dá para excluir: ${(preview.bloqueios ?? []).join('; ')}. Houve movimento real, então o histórico fica guardado.`); return; }
      const lines = (preview.avisos ?? []) as string[];
      const text = lines.length ? `Excluir este bolão de vez?\n\nSerá apagado:\n- ${lines.join('\n- ')}\n\nNão dá para desfazer.` : 'Excluir este bolão de vez? Não dá para desfazer.';
      if (!window.confirm(text)) return;
      await execute(`/api/v1/admin/boloes/${item.id}/sem-movimentacao${lines.length ? '?forcar=true' : ''}`, { method: 'DELETE' }, 'Bolão excluído.');
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.'); }
  }
  const staffItems = items.filter((item) => item.origem !== 'afiliado');
  const affiliateItems = items.filter((item) => item.origem === 'afiliado');
  const sumOf = (list: Array<Record<string, any>>, key: 'pagas' | 'disponiveis' | 'arrecadado') => list.reduce((sum, item) => sum + Number(item.indicadores?.[key] ?? 0), 0);
  const tableHead = <thead><tr><th>Bolão</th><th>Jogos e registro</th><th>Cotas</th><th>Valores</th><th>Venda</th><th>Status</th><th className="th-actions">Ações</th></tr></thead>;
  const [offering, setOffering] = useState<Record<string, any> | null>(null);
  const [transferring, setTransferring] = useState<Record<string, any> | null>(null);
  const [officialGroups, setOfficialGroups] = useState<Array<Record<string, any>>>([]);
  const [offerGroupId, setOfferGroupId] = useState('');
  async function openOffer(item: Record<string, any>) {
    try {
      const data = await fetchAdmin('/api/v1/admin/grupos?page=1&pageSize=100');
      const official = ((data?.items ?? []) as Array<Record<string, any>>).filter((group) => group.tipo === 'oficial');
      if (!official.length) { notify('error', 'Não há grupo oficial da BL cadastrado.'); return; }
      setOfficialGroups(official); setOfferGroupId(String(official[0]?.id ?? '')); setOffering(item);
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível abrir os grupos.'); }
  }
  async function submitOffer() {
    if (!offering || !offerGroupId) return;
    try {
      await fetchAdmin(`/api/v1/admin/boloes/${offering.id}/oferta-bl`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grupoId: offerGroupId }) });
      notify('success', 'As cotas livres agora também são vendidas no grupo da BL.');
      setOffering(null); await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível oferecer as cotas.'); }
  }
  const renderRow = (item: Record<string, any>) => {
    const isDraft = item.status === 'rascunho';
    const pendingApproval = isDraft && Boolean(item.aprovacao?.solicitadaEm);
    const publishLabel = pendingApproval ? 'Aprovar e abrir venda' : 'Publicar';
    const publishDone = pendingApproval ? 'Bolão aprovado e aberto para venda.' : 'Bolão publicado.';
    return <tr key={item.id}>
      <td className="cell-wrap" data-label="Bolão"><strong>{modalityNames[item.concurso?.modalidade] ?? item.concurso?.modalidade ?? '—'}</strong><small>{item.concurso?.nomeEspecial ? `${item.concurso.nomeEspecial} · ` : ''}{item.concurso ? (item.concurso.numeroConcurso > 0 ? `#${item.concurso.numeroConcurso}` : 'número a definir') : '—'}</small><small>{item.criador?.nome ?? '—'} · {dateTime(item.criadoEm)}</small>{item.origem === 'afiliado' && item.grupo?.nome ? <small>grupo {item.grupo.nome}</small> : null}</td>
      <td className="cell-wrap" data-label="Jogos e registro">{noNumbers(item) ? <strong>Números a definir</strong> : <strong>{item.indicadores?.jogos ?? item.jogos?.length ?? 0} jogo(s){item.jogos?.[0]?.quantidadeDezenas ? ` de ${item.jogos[0].quantidadeDezenas}` : ''}</strong>}{item.registro?.registrado ? <span className="status-chip status-success">Registrado</span> : <span className="status-chip status-warning">Aguardando registro</span>}<small>{item.registro?.arquivos ? `${item.registro.arquivos} arquivo(s)` : 'sem comprovante'}</small></td>
      <td className="cell-wrap" data-label="Cotas"><strong>{item.cotasIlimitadas ? 'Ilimitadas' : `${item.indicadores?.disponiveis ?? 0} livres`}</strong><small>{item.cotasIlimitadas ? 'sem estoque máximo' : `${item.totalCotas ?? 0} no total`}</small><small>{item.indicadores?.pagas ?? 0} pagas · {item.indicadores?.reservadas ?? 0} reservadas</small></td>
      <td className="cell-wrap" data-label="Valores"><strong>{money(item.valorCota)} <span className="muted">/ cota</span></strong><small>prevista {money(item.indicadores?.receitaPrevista)}</small></td>
      <td className="cell-wrap" data-label="Venda"><strong>até {dateTime(item.janelaVenda?.fimEm ?? item.concurso?.cutoffAt)}</strong><small>desde {dateTime(item.janelaVenda?.inicioEm ?? item.criadoEm)}</small></td>
      <td className="cell-wrap" data-label="Status"><span className={statusClass(item.status)}>{isDraft && pendingApproval ? 'Aguardando aprovação' : statusLabel(item.status)}</span>{item.aprovacao?.aprovadoEm && <small>aprovado pela administração</small>}{item.ofertaBlGrupo && <small>cotas livres na BL · {item.ofertaBlGrupo.nome}</small>}{item.liberacao?.condicional && <small>{item.liberacao.liberado ? 'cotas liberadas' : `libera com prêmio de ${money(item.liberacao.gatilho)}`}{!item.liberacao.liberado && Number(item.indicadores?.interessados) > 0 ? ` · ${item.indicadores.interessados} pediram aviso` : ''}</small>}</td>
      <td className="td-actions"><div className="row-actions-main">
        {isDraft
          ? <button type="button" className="admin-button admin-button-small admin-button-primary" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/publicar`, { method: 'POST' }, publishDone)}>{publishLabel}</button>
          : noNumbers(item)
            ? <button type="button" className="admin-button admin-button-small admin-button-primary" onClick={() => { setDefiningPool(item); setNumbersText(''); }}>Definir números</button>
            : item.status !== 'cancelado'
              ? <button type="button" className="admin-button admin-button-small" onClick={() => setAttachFor({ pool: poolForAttachments(item) })}>Registro</button>
              : null}
        <RowMenu items={[
          { label: 'Fechar bolão', hint: 'Encerra a venda agora', hidden: item.status !== 'aberto', onClick: () => { void execute(`/api/v1/admin/boloes/${item.id}/fechar`, { method: 'POST' }, 'Bolão fechado.'); } },
          { label: 'Ver página do bolão', href: `/boloes/${item.id}`, hidden: false },
          { label: 'Comprovantes', onClick: () => setAttachFor({ pool: poolForAttachments(item) }), hint: 'Enviar ou ver os arquivos' },
          { label: 'Controle de cotas', href: '/admin?view=controle' },
          { label: 'Editar', onClick: () => setEditingPool(item), hidden: !['rascunho', 'aberto'].includes(item.status) },
          { label: 'Trocar concurso', hint: 'Bolão sem venda paga', hidden: !['rascunho', 'aberto', 'fechado'].includes(item.status), onClick: () => { setMovingPool(item); setMoveTo(''); } },
          { label: 'Liberar cotas agora', hidden: !(item.liberacao?.condicional && !item.liberacao.liberado && ['aberto', 'rascunho'].includes(item.status)), onClick: () => { if (window.confirm('Liberar as cotas deste bolão agora, sem esperar o prêmio atingir o gatilho?')) void execute(`/api/v1/admin/boloes/${item.id}/liberar`, { method: 'POST' }, 'Cotas liberadas.'); } },
          { label: 'Oferecer cotas livres nos grupos da BL', hint: 'Bolão de afiliado', hidden: !(item.origem === 'afiliado' && item.status === 'aberto' && !item.ofertaBlGrupo), onClick: () => { void openOffer(item); } },
          { label: 'Transferir cotistas para outro bolão', hint: 'Mesmo concurso e mesmo valor', hidden: !['aberto', 'fechado'].includes(item.status) || !(Number(item.indicadores?.pagas) > 0), onClick: () => setTransferring(item) },
          { label: 'Devolver cotas ao afiliado', hidden: !item.ofertaBlGrupo, onClick: () => { if (window.confirm('Voltar a vender as cotas livres só pelo grupo do afiliado?')) void execute(`/api/v1/admin/boloes/${item.id}/oferta-bl`, { method: 'DELETE' }, 'As cotas livres voltaram para o grupo do afiliado.'); } },
          { label: 'Novo lote (duplicar)', onClick: () => execute(`/api/v1/admin/boloes/${item.id}/duplicar`, { method: 'POST' }, 'Novo lote criado como rascunho. Revise os jogos e publique.') },
          { label: 'Recusar pedido', hidden: !pendingApproval, onClick: () => { const motivo = window.prompt('Por que não aprovar? O afiliado vai receber este recado.'); if (motivo && motivo.trim().length >= 3) void execute(`/api/v1/admin/boloes/${item.id}/recusar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() }) }, 'Pedido recusado. O afiliado foi avisado.'); } },
          { label: 'Cancelar bolão', danger: true, hidden: ['registrado', 'apurado', 'cancelado'].includes(item.status), onClick: () => { if (window.confirm('Cancelar este bolão?')) void execute(`/api/v1/admin/boloes/${item.id}`, { method: 'DELETE' }, 'Bolão cancelado.'); } },
          { label: 'Excluir bolão', danger: true, disabled: busy, hint: 'Só se não houve venda paga', onClick: () => { void removePool(item); } },
        ]} />
      </div></td>
    </tr>;
  };
  return <><SectionHeading title="Bolões" action={<button className="admin-button" onClick={() => setShowPoolForm(value => !value)}>{showPoolForm ? 'Recolher formulário' : '+ Novo bolão'}</button>} /><div className="admin-mini-stats"><span>Total <strong>{items.length}</strong></span><span>Rascunhos <strong>{items.filter((item) => item.status === 'rascunho').length}</strong></span><span>Abertos <strong>{items.filter((item) => item.status === 'aberto').length}</strong></span><span>Fechados <strong>{items.filter((item) => item.status === 'fechado').length}</strong></span></div>{(showPoolForm || editingPool) && <Panel title={editingPool ? "Editar bolão" : "Criar bolão"}><SimplePoolWizard contests={contests} groupId={groupId} editPool={editingPool} onCancelEdit={() => setEditingPool(null)} onContestCreated={async () => { await load(); }} onSuccess={async (created) => { setEditingPool(null); setShowPoolForm(false); await load(); if (created?.id) setAttachFor({ pool: poolForAttachments(created) }); }} /></Panel>}{movingPool && <Panel title="Trocar o concurso do bolão"><label className="admin-field"><span>Novo concurso ({modalityNames[movingPool.concurso?.modalidade] ?? movingPool.concurso?.modalidade})</span><select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}><option value="">Selecione</option>{contests.filter((contest) => contest.modalidade === movingPool.concurso?.modalidade && contest.id !== movingPool.concursoId).map((contest) => <option key={contest.id} value={contest.id}>{contest.nomeEspecial ? `${contest.nomeEspecial} · ` : ''}{contest.numeroConcurso > 0 ? `#${contest.numeroConcurso}` : 'número a definir'} · {dateTime(contest.dataSorteio)}{contest.fonteSincronizacao === 'projetado' ? ' (previsto)' : ''}</option>)}</select></label><div className="wizard-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}><button type="button" className="admin-button admin-button-primary" disabled={!moveTo} onClick={() => void submitMove()}>Trocar concurso</button><button type="button" className="admin-button admin-button-ghost" onClick={() => { setMovingPool(null); setMoveTo(''); }}>Cancelar</button></div></Panel>}{definingPool && <Panel title="Definir os números do bolão"><textarea rows={6} value={numbersText} onChange={(event) => setNumbersText(event.target.value)} placeholder="Ex.: 04 12 23 35 44 58" style={{ width: '100%' }} /><div className="wizard-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}><button type="button" className="admin-button admin-button-primary" disabled={definingBusy} onClick={() => void submitNumbers()}>{definingBusy ? 'Salvando…' : 'Salvar números'}</button><button type="button" className="admin-button admin-button-ghost" onClick={() => { setDefiningPool(null); setNumbersText(''); }}>Cancelar</button></div></Panel>}{transferring && <PoolTransferPanel key={transferring.id} pool={transferring} onClose={() => setTransferring(null)} onDone={load} notify={notify} />}{offering && <Panel title="Oferecer as cotas livres nos grupos da BL"><label className="admin-field"><span>Grupo da BL</span><select value={offerGroupId} onChange={(event) => setOfferGroupId(event.target.value)}>{officialGroups.map((group) => <option key={group.id} value={group.id}>{group.nome}</option>)}</select></label><div className="wizard-actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}><button type="button" className="admin-button admin-button-primary" onClick={() => void submitOffer()}>Oferecer cotas</button><button type="button" className="admin-button admin-button-ghost" onClick={() => setOffering(null)}>Cancelar</button></div></Panel>}<Panel className="admin-pools-compact" title={`Bolões da equipe · criados pelos administradores`}>{staffItems.length ? <><div className="admin-mini-stats"><span>Bolões <strong>{staffItems.length}</strong></span><span>Cotas pagas <strong>{sumOf(staffItems, 'pagas')}</strong></span><span>Cotas livres <strong>{sumOf(staffItems, 'disponiveis')}</strong></span><span>Arrecadado <strong>{money(sumOf(staffItems, 'arrecadado'))}</strong></span></div><Table minWidth={1040}>{tableHead}<tbody>{staffItems.map(renderRow)}</tbody></Table></> : <Empty title="Nenhum bolão da equipe" />}</Panel><Panel className="admin-pools-compact" title={`Bolões de afiliados`}>{affiliateItems.length ? <><div className="admin-mini-stats"><span>Bolões <strong>{affiliateItems.length}</strong></span><span>Cotas pagas <strong>{sumOf(affiliateItems, 'pagas')}</strong></span><span>Cotas livres <strong>{sumOf(affiliateItems, 'disponiveis')}</strong></span><span>Arrecadado <strong>{money(sumOf(affiliateItems, 'arrecadado'))}</strong></span></div><Table minWidth={1040}>{tableHead}<tbody>{affiliateItems.map(renderRow)}</tbody></Table></> : <Empty title="Nenhum bolão de afiliado" />}</Panel></>;
}
