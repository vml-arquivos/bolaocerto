'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type RecordValue = Record<string, any>;

type PoolWizardProps = {
  contests: RecordValue[];
  groupId: string | null;
  groups?: RecordValue[];
  role?: 'admin' | 'affiliate';
  editPool?: RecordValue | null;
  onCancelEdit?: () => void;
  onSuccess: () => Promise<void> | void;
};

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

const modalityLimits: Record<string, { max: number; min: number }> = {
  megasena: { max: 60, min: 6 },
  lotofacil: { max: 25, min: 15 },
  quina: { max: 80, min: 5 },
  lotomania: { max: 100, min: 50 },
  duplasena: { max: 50, min: 6 },
  timemania: { max: 80, min: 10 },
  diadesorte: { max: 31, min: 7 },
  supersete: { max: 7, min: 7 },
  loteca: { max: 14, min: 1 },
};

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateOnly(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

async function authFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  return response;
}

export function PoolWizard({ contests, groupId, groups = [], role = 'admin', editPool, onCancelEdit, onSuccess }: PoolWizardProps) {
  const editing = Boolean(editPool?.id);
  const [modality, setModality] = useState('megasena');
  const [contestId, setContestId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(groupId ?? '');
  const [numbers, setNumbers] = useState('');
  const [totalCotas, setTotalCotas] = useState('10');
  const [unlimited, setUnlimited] = useState(false);
  const [valorCota, setValorCota] = useState('20');
  const [taxa, setTaxa] = useState('10');
  const [custo, setCusto] = useState('0');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editPool) {
      setModality('megasena');
      setContestId('');
      setSelectedGroupId(groupId ?? '');
      setNumbers('');
      setTotalCotas('10');
      setUnlimited(false);
      setValorCota('20');
      setTaxa('10');
      setCusto('0');
      setDescription('');
      return;
    }
    const existingModality = String(editPool.concurso?.modalidade ?? editPool.modalidade ?? 'megasena');
    const existingNumbers = editPool.jogos?.[0]?.numeros ?? editPool.numerosApostados ?? [];
    setModality(existingModality);
    setContestId(String(editPool.concursoId ?? editPool.concurso?.id ?? ''));
    setSelectedGroupId(String(editPool.grupoId ?? groupId ?? ''));
    setNumbers(existingNumbers.join(' '));
    setTotalCotas(editPool.totalCotas == null ? '' : String(editPool.totalCotas));
    setUnlimited(Boolean(editPool.cotasIlimitadas));
    setValorCota(String(editPool.valorCota ?? '20'));
    setTaxa(String(editPool.taxaAdministracaoPct ?? '10'));
    setCusto(String(editPool.jogos?.[0]?.custo ?? '0'));
    setDescription(String(editPool.grupo?.descricao ?? ''));
    setMessage('');
  }, [editPool, groupId]);

  const limits = modalityLimits[modality] ?? modalityLimits.megasena!;
  const availableContests = useMemo(() => contests.filter((contest) => contest.modalidade === modality && ['aberto', 'aberta'].includes(String(contest.status).toLowerCase())), [contests, modality]);
  const selectedContest = contests.find((contest) => contest.id === contestId) ?? (editPool?.concursoId === contestId ? editPool.concurso : null);
  const parsedNumbers = numbers.split(/[\s,;]+/).map(Number).filter((number) => Number.isInteger(number) && number >= 1 && number <= limits.max);
  const uniqueNumbers = Array.from(new Set(parsedNumbers)).sort((a, b) => a - b);
  const finiteRevenue = unlimited ? null : Number(totalCotas || 0) * Number(valorCota || 0);

  useEffect(() => {
    if (!contestId && availableContests[0]) setContestId(availableContests[0].id);
  }, [availableContests, contestId]);

  function resetAfterSave() {
    setContestId('');
    setNumbers('');
    setTotalCotas('10');
    setUnlimited(false);
    setValorCota('20');
    setTaxa('10');
    setCusto('0');
    setDescription('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!selectedContest || (!editing && !selectedGroupId)) {
      setMessage('Selecione um concurso aberto e um grupo válido.');
      return;
    }
    if (uniqueNumbers.length < limits.min) {
      setMessage(`Informe pelo menos ${limits.min} números válidos para ${modalityNames[modality] ?? modality}.`);
      return;
    }
    if (Number(valorCota) <= 0 || Number(taxa) < 0 || Number(taxa) > 35) {
      setMessage('Revise o valor da cota e a taxa administrativa.');
      return;
    }
    if (!unlimited && (!Number.isInteger(Number(totalCotas)) || Number(totalCotas) < 1)) {
      setMessage('Informe um total de cotas válido ou marque “Cotas ilimitadas”.');
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...(editing ? {} : { concursoId: selectedContest.id, grupoId: selectedGroupId }),
        numerosApostados: uniqueNumbers,
        jogos: [{ ordem: 1, numeros: uniqueNumbers, quantidadeDezenas: uniqueNumbers.length, custo: Number(custo || 0) }],
        ...(unlimited ? { cotasIlimitadas: true, totalCotas: undefined } : { cotasIlimitadas: false, totalCotas: Number(totalCotas) }),
        valorCota: Number(valorCota),
        taxaAdministracaoPct: Number(taxa),
        ...(description.trim() ? { descricao: description.trim() } : {}),
        ...(editing ? {} : { modeloOperacional: 'mandato' }),
      };
      const prefix = role === 'affiliate' ? '/api/v1/afiliados/me/boloes' : '/api/v1/admin/boloes';
      const path = editing ? `${prefix}/${editPool!.id}` : prefix;
      const response = await authFetch(path, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || (editing ? 'Não foi possível editar o bolão.' : 'Não foi possível criar o bolão.'));
      setMessage(editing ? 'Bolão atualizado com sucesso.' : 'Bolão criado como rascunho.');
      await onSuccess();
      if (!editing) resetAfterSave();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar o bolão.');
    } finally {
      setSaving(false);
    }
  }

  return <form className="pool-wizard pool-wizard-simple" onSubmit={submit}>
    <div className="simple-form-heading"><div><span className="admin-eyebrow">{editing ? 'Edição rápida' : 'Criação rápida'}</span><h3>{editing ? 'Editar bolão' : 'Novo bolão'}</h3><p>{editing ? 'Atualize os dados enquanto o bolão estiver em rascunho ou aberto.' : 'Preencha os dados essenciais em uma única tela. O bolão nasce como rascunho.'}</p></div>{editing && <button type="button" className="admin-button admin-button-ghost" onClick={onCancelEdit}>Cancelar edição</button>}</div>
    {message && <div className="admin-callout admin-callout-warning">{message}</div>}
    <div className="admin-form-grid admin-form-grid-three">
      {role === 'affiliate' && <label className="admin-field"><span>Grupo próprio</span><select value={selectedGroupId} disabled={editing} onChange={(event) => setSelectedGroupId(event.target.value)}><option value="">Selecione</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.nome}</option>)}</select></label>}
      <label className="admin-field"><span>Modalidade</span><select value={modality} disabled={editing} onChange={(event) => { setModality(event.target.value); setContestId(''); }}><option value="megasena">Mega-Sena</option><option value="lotofacil">Lotofácil</option><option value="quina">Quina</option><option value="lotomania">Lotomania</option><option value="duplasena">Dupla Sena</option><option value="timemania">Timemania</option><option value="diadesorte">Dia de Sorte</option><option value="supersete">Super Sete</option><option value="loteca">Loteca</option></select></label>
      <label className="admin-field admin-field-wide"><span>Concurso aberto</span><select value={contestId} disabled={editing} onChange={(event) => setContestId(event.target.value)}><option value="">Selecione</option>{availableContests.map((contest) => <option value={contest.id} key={contest.id}>#{contest.numeroConcurso} · {dateOnly(contest.dataSorteio)} · prêmio {money(contest.valorEstimadoPremio)}</option>)}</select>{!selectedContest && <small>Nenhum concurso disponível para esta modalidade. Sincronize os concursos.</small>}</label>
      <label className="admin-field admin-field-wide"><span>Números do jogo</span><input value={numbers} onChange={(event) => setNumbers(event.target.value)} placeholder="Ex.: 04 12 23 35 44 58" /><small>{uniqueNumbers.length}/{limits.min} mínimos · separe por espaço, vírgula ou ponto e vírgula.</small></label>
    </div>
    <div className="admin-form-grid admin-form-grid-four">
      <label className="admin-field"><span>Valor da cota (R$)</span><input type="number" min="0.01" step="0.01" value={valorCota} onChange={(event) => setValorCota(event.target.value)} /></label>
      <label className="admin-field"><span>Taxa administrativa (%)</span><input type="number" min="0" max="35" step="0.01" value={taxa} onChange={(event) => setTaxa(event.target.value)} /></label>
      <label className={`admin-field ${unlimited ? 'is-disabled' : ''}`}><span>Total de cotas</span><input type="number" min="1" value={totalCotas} disabled={unlimited} onChange={(event) => setTotalCotas(event.target.value)} /></label>
      <label className="admin-field"><span>Custo do jogo (R$)</span><input type="number" min="0" step="0.01" value={custo} onChange={(event) => setCusto(event.target.value)} /></label>
    </div>
    <label className="admin-toggle-row"><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} /><span><strong>Cotas ilimitadas</strong><small>Permite reservas sem estoque máximo. A receita será apurada conforme as vendas.</small></span></label>
    <label className="admin-field"><span>Descrição pública</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explique a estratégia, transparência e operação do bolão." /></label>
    <div className="simple-form-summary"><span>Concurso <strong>{selectedContest ? `#${selectedContest.numeroConcurso}` : '—'}</strong></span><span>Disponibilidade <strong>{unlimited ? 'Ilimitada' : `${totalCotas || 0} cotas`}</strong></span><span>Receita prevista <strong>{finiteRevenue === null ? 'Sob demanda' : money(finiteRevenue)}</strong></span></div>
    <div className="wizard-actions"><button className="admin-button admin-button-primary" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar bolão'}</button></div>
  </form>;
}
