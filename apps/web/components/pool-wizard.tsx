'use client';

import { LotteryPriceAdmin } from './lottery-price-admin';
import { BankPicker } from './admin-numbers';
import { concursoNo } from '../lib/contest';
import { authenticatedFetch as authFetch } from '../lib/client-api';
import { modalityNames } from '../lib/domain';
import { formatBRL as money } from '../lib/format';
import { planPricing, toCents, type QuotaMode, type FeeMode } from '../lib/pool-pricing';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type RecordValue = Record<string, any>;

type PoolWizardProps = {
  contests: RecordValue[];
  groupId: string | null;
  groups?: RecordValue[];
  role?: 'admin' | 'affiliate';
  editPool?: RecordValue | null;
  onCancelEdit?: () => void;
  /** Recebe o bolão criado (quando é criação), para a tela abrir o envio do comprovante em seguida. */
  onSuccess: (created?: RecordValue) => Promise<void> | void;
  /** Abre o assistente já com este concurso escolhido (usado pela lista de concursos). */
  initialContestId?: string;
  /** Chamado depois de criar um concurso de data comemorativa, para a lista de concursos recarregar. */
  onContestCreated?: () => Promise<void> | void;
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

function dateOnly(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function toLocalInput(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PoolWizard({ contests, groupId, groups = [], role = 'admin', editPool, onCancelEdit, onSuccess, onContestCreated, initialContestId }: PoolWizardProps) {
  const initialContest = initialContestId ? contests.find((contest) => contest.id === initialContestId) : undefined;
  const editing = Boolean(editPool?.id);
  const freeMode = role === 'admin' && !editing;
  const [modality, setModality] = useState<string>(String(initialContest?.modalidade ?? 'megasena'));
  const [contestId, setContestId] = useState<string>(String(initialContest?.id ?? ''));
  const [selectedGroupId, setSelectedGroupId] = useState(groupId ?? '');
  const [numbers, setNumbers] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [totalCotas, setTotalCotas] = useState('10');
  const [unlimited, setUnlimited] = useState(false);
  const [valorCota, setValorCota] = useState('20');
  const [taxa, setTaxa] = useState('10');
  const [custo, setCusto] = useState('0');
  const [description, setDescription] = useState('');
  const [conditional, setConditional] = useState(false);
  const [trigger, setTrigger] = useState('100000000');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [specialValue, setSpecialValue] = useState('');
  // Preço livre (administrador): a tabela da CAIXA só dá o custo do registro; a cota e a taxa são definidas aqui.
  const [quotaMode, setQuotaMode] = useState<QuotaMode>('digitar');
  const [quotaValue, setQuotaValue] = useState('');
  const [feeMode, setFeeMode] = useState<FeeMode>('pct');
  const [feeValue, setFeeValue] = useState('');
  const [manualCost, setManualCost] = useState('');
  const [quote, setQuote] = useState<RecordValue | null>(null);
  const [quoteError, setQuoteError] = useState('');
  // Gerador de jogos
  const [genCount, setGenCount] = useState('1');
  const [genSize, setGenSize] = useState('');
  const [genStrategy, setGenStrategy] = useState('equilibrado');
  const [genFixed, setGenFixed] = useState('');
  const [genExclude, setGenExclude] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [generated, setGenerated] = useState<RecordValue | null>(null);
  const [priceTable, setPriceTable] = useState<Record<string, number>>({});
  // Data comemorativa (sem concurso aberto) e regras de venda
  const [newDate, setNewDate] = useState(false);
  const [festaChoice, setFestaChoice] = useState('personalizado');
  const [festaName, setFestaName] = useState('');
  const [festaDate, setFestaDate] = useState('');
  const [festaHora, setFestaHora] = useState('20:00');
  const [festaBusy, setFestaBusy] = useState(false);
  const [festaPresets, setFestaPresets] = useState<Array<{ chave: string; nome: string; modalidade: string; proximoSorteio?: { data: string; hora: string; confirmado: boolean; fonte: string } | null }>>([]);
  const [presale, setPresale] = useState(false);
  const [numbersLater, setNumbersLater] = useState(false);
  const [saleStart, setSaleStart] = useState('');
  const [saleEnd, setSaleEnd] = useState('');
  const [maxPerPerson, setMaxPerPerson] = useState('');
  const [saleText, setSaleText] = useState('');

  useEffect(() => {
    if (!editPool) {
      setAutomatic(true);
      setModality(initialContest?.modalidade ?? 'megasena');
      setContestId(initialContest?.id ?? '');
      setSelectedGroupId(groupId ?? '');
      setNumbers('');
      setTotalCotas('10');
      setUnlimited(false);
      setValorCota('20');
      setTaxa('10');
      setCusto('0');
      setDescription('');
      setConditional(false);
      setTrigger('100000000');
      setPresale(false); setNumbersLater(false); setSaleStart(''); setSaleEnd(''); setMaxPerPerson(''); setSaleText(''); setNewDate(false);
      return;
    }
    const existingModality = String(editPool.concurso?.modalidade ?? editPool.modalidade ?? 'megasena');
    const existingNumbers = editPool.jogos?.[0]?.numeros ?? editPool.numerosApostados ?? [];
    setModality(existingModality);
    setContestId(String(editPool.concursoId ?? editPool.concurso?.id ?? ''));
    setSelectedGroupId(String(editPool.grupoId ?? groupId ?? ''));
    setNumbers((editPool.jogos?.length ? editPool.jogos.map((g: RecordValue) => g.numeros.join(' ')) : [existingNumbers.join(' ')]).join('\n'));
    setAutomatic(Boolean(editPool.precificacao));
    setTotalCotas(editPool.totalCotas == null ? '' : String(editPool.totalCotas));
    setUnlimited(Boolean(editPool.cotasIlimitadas));
    setValorCota(String(editPool.valorCota ?? '20'));
    setTaxa(String(editPool.taxaAdministracaoPct ?? '10'));
    setCusto(String(editPool.jogos?.[0]?.custo ?? '0'));
    setDescription(String(editPool.grupo?.descricao ?? ''));
    setConditional(Boolean(editPool.liberacao?.condicional));
    setTrigger(editPool.liberacao?.gatilho ? String(editPool.liberacao.gatilho) : '100000000');
    setPresale(Boolean(editPool.regrasVenda?.antecipada));
    setSaleStart(toLocalInput(editPool.regrasVenda?.inicioEm));
    setSaleEnd(toLocalInput(editPool.regrasVenda?.fimEm));
    setMaxPerPerson(editPool.regrasVenda?.maxCotasPorPessoa ? String(editPool.regrasVenda.maxCotasPorPessoa) : '');
    setSaleText(String(editPool.regrasVenda?.texto ?? ''));
    setNewDate(false);
    setMessage('');
  }, [editPool, groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const limits = modalityLimits[modality] ?? modalityLimits.megasena!;
  // Concurso de festa não entra na lista de abertos: só aparece se já foi escolhido ou criado agora (botão "nova data comemorativa").
  const availableContests = useMemo(() => contests.filter((contest) => contest.modalidade === modality && ['aberto', 'aberta'].includes(String(contest.status).toLowerCase()) && (!contest.especial || contest.id === contestId)), [contests, modality, contestId]);
  const selectedContest = contests.find((contest) => contest.id === contestId) ?? (editPool?.concursoId === contestId ? editPool.concurso : null);
  // Timemania: Time do Coração; Dia de Sorte: Mês de Sorte. Vale para todos os jogos e serve para conferir esse prêmio na apuração.
  const specialSelecao = useMemo(() => modality === 'timemania' && specialValue.trim() ? { timeCoracao: specialValue.trim() } : modality === 'diadesorte' && Number(specialValue) >= 1 && Number(specialValue) <= 12 ? { mesSorte: Number(specialValue) } : null, [modality, specialValue]);
  const games = useMemo(() => numbers.trim().split(/\n+/).filter(Boolean).map((line, i) => ({ ordem: i + 1, numeros: line.trim().split(/[\s,;]+/).map(Number), ...(specialSelecao ? { selecao: specialSelecao } : {}) })), [numbers, specialSelecao]);
  const uniqueNumbers = games[0]?.numeros ?? [];
  const canPrice = ['megasena', 'lotofacil', 'quina', 'duplasena', 'lotomania'].includes(modality);
  useEffect(() => {
    let off = false; let attempt = 0;
    const load = () => fetch('/api/v1/loterias/precos').then(async (response) => {
      const rows = response.ok ? await response.json() as Array<{ modalidade: string; chave: string; valorCentavos: number }> : [];
      if (off) return;
      if (rows.length) setPriceTable(Object.fromEntries(rows.map((row) => [`${row.modalidade}:${row.chave}`, row.valorCentavos])));
      else if (attempt++ < 3) setTimeout(load, 2500);
    }).catch(() => { if (!off && attempt++ < 3) setTimeout(load, 2500); });
    void load();
    return () => { off = true; };
  }, []);
  useEffect(() => { setGenSize(String(limits.min)); setGenerated(null); setGenError(''); }, [modality]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const groupCapacity: number | null = role === 'affiliate' && selectedGroup ? Number(selectedGroup.capacidade ?? 0) : null;
  const sizeNumber = Number(genSize || limits.min);
  const gameCountNumber = Math.min(Math.max(Math.trunc(Number(genCount) || 1), 1), 100);
  const unitCents = priceTable[`${modality}:${sizeNumber}`];
  // Quantidades de números que a CAIXA vende para esta modalidade (tabela de preços).
  const sizeOptions = useMemo(() => Object.keys(priceTable).filter((key) => key.startsWith(`${modality}:`)).map((key) => key.slice(modality.length + 1)).filter((chave) => /^\d+$/.test(chave)).map(Number).sort((a, b) => a - b), [priceTable, modality]);
  // Custo e cota calculados aqui mesmo, com os jogos escritos e a tabela da CAIXA (a cotação do servidor confirma na hora de salvar).
  // Custo do registro dos jogos escritos (só a tabela da CAIXA, sem taxa nem cota).
  const registroLocal = useMemo(() => {
    if (!canPrice || games.length === 0) return null;
    let cost = 0;
    for (const game of games) {
      const price = priceTable[`${modality}:${game.numeros.length}`];
      if (price === undefined) return null;
      cost += price;
    }
    return cost > 0 ? cost : null;
  }, [canPrice, games, priceTable, modality]);
  const localQuote = useMemo(() => {
    if (!canPrice || games.length === 0) return null;
    let cost = 0;
    for (const game of games) {
      const price = priceTable[`${modality}:${game.numeros.length}`];
      if (price === undefined) return null;
      cost += price;
    }
    const shares = Math.trunc(Number(totalCotas));
    const feeBps = Math.round(Number(taxa) * 100);
    if (!Number.isSafeInteger(shares) || shares <= 0 || !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 3500 || cost <= 0) return null;
    const ticketPerShare = Math.ceil(cost / shares);
    const feePerShare = Math.round(ticketPerShare * feeBps / 10000);
    return { cost, shares, ticketPerShare, feePerShare, quotaCents: ticketPerShare + feePerShare, totalCents: (ticketPerShare + feePerShare) * shares };
  }, [canPrice, games, priceTable, modality, totalCotas, taxa]);
  useEffect(() => {
    if (!automatic || editing || freeMode || !localQuote) return;
    setValorCota((localQuote.quotaCents / 100).toFixed(2));
    setCusto((localQuote.cost / 100).toFixed(2));
  }, [automatic, editing, localQuote?.quotaCents, localQuote?.cost]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewTotal = unitCents === undefined ? null : unitCents * gameCountNumber;
  async function generateGames() {
    setGenerating(true); setGenError('');
    try {
      const response = await authFetch('/api/v1/admin/boloes/gerar-jogos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modalidade: modality, quantidade: gameCountNumber, dezenas: sizeNumber, estrategia: genStrategy, ...(genFixed.trim() ? { fixos: genFixed.trim() } : {}), ...(genExclude.trim() ? { excluir: genExclude.trim() } : {}) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível gerar os jogos.');
      setGenerated(data);
      setNumbers((data.jogos as Array<{ numeros: number[] }>).map((game) => game.numeros.map((n) => String(n).padStart(2, '0')).join(' ')).join('\n'));
    } catch (error) { setGenError(error instanceof Error ? error.message : 'Falha ao gerar.'); }
    finally { setGenerating(false); }
  }
  useEffect(() => {
    setQuote(null); setQuoteError('');
    if (!automatic || editing || !canPrice || !contestId || !selectedGroupId || !numbers.trim() || unlimited) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await authFetch('/api/v1/admin/boloes/cotacao', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ concursoId: contestId, grupoId: selectedGroupId, numerosApostados: uniqueNumbers, jogos: games, totalCotas: Number(totalCotas), valorCota: 1, taxaAdministracaoPct: freeMode ? 0 : Number(taxa), modeloOperacional: 'mandato' }) });
        const data = await response.json();
        if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message);
        if (!Number.isFinite(data.quotaCents) || !Number.isFinite(data.costCents)) throw new Error('Cotação inválida.');
        if (!controller.signal.aborted) { setQuote(data); if (!freeMode) { setValorCota((data.quotaCents / 100).toFixed(2)); setCusto((data.costCents / 100).toFixed(2)); } }
      } catch (error) { if (!controller.signal.aborted) setQuoteError(error instanceof Error ? error.message : 'Falha na cotação.'); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [automatic, editing, canPrice, contestId, selectedGroupId, numbers, totalCotas, taxa, unlimited]);
  useEffect(() => {
    if (!newDate || festaPresets.length) return;
    authFetch('/api/v1/admin/concursos/festas').then(async (response) => { if (response.ok) setFestaPresets(await response.json()); }).catch(() => undefined);
  }, [newDate, festaPresets.length]);
  const modalityPresets = festaPresets.filter((preset) => preset.modalidade === modality);
  useEffect(() => { setFestaChoice(modalityPresets[0]?.chave ?? 'personalizado'); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality, festaPresets]);
  const festaPreset = modalityPresets.find((item) => item.chave === festaChoice);
  const festaSorteio = festaPreset?.proximoSorteio ?? null;
  // Ao escolher a festa, a data e a hora do sorteio já vêm preenchidas (o administrador ainda pode ajustar).
  useEffect(() => {
    if (festaSorteio) { setFestaDate(festaSorteio.data); setFestaHora(festaSorteio.hora); }
    else { setFestaDate(''); setFestaHora('20:00'); }
  }, [festaSorteio?.data, festaSorteio?.hora, festaChoice]); // eslint-disable-line react-hooks/exhaustive-deps
  async function createDateContest() {
    setMessage('');
    if (!festaDate) { setMessage('Escolha o dia do sorteio.'); return; }
    const preset = modalityPresets.find((item) => item.chave === festaChoice);
    if (!preset && !festaName.trim()) { setMessage('Dê um nome para a data (ex.: Quina do Natal).'); return; }
    setFestaBusy(true);
    try {
      const response = await authFetch('/api/v1/admin/concursos/festa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ especial: preset ? preset.chave : 'personalizado', dataSorteio: festaDate, horaSorteio: festaHora || '20:00', ...(preset ? {} : { modalidade: modality, nomeEspecial: festaName.trim() }) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível criar o concurso desta data.');
      await onContestCreated?.();
      setContestId(String(data.id)); setNewDate(false); setFestaName('');
      setMessage('Concurso da data criado e selecionado. Agora é só definir os jogos e as cotas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar o concurso desta data.'); }
    finally { setFestaBusy(false); }
  }
  async function suggestGame() {
    setSuggesting(true);
    try {
      const response = await fetch(`/api/v1/estatisticas/${modality}/sugestoes?jogos=1&dezenas=${limits.min}`);
      const body = await response.json() as { games?: Array<{ numbers: number[] }> };
      const game = body.games?.[0];
      if (response.ok && game) setNumbers(game.numbers.map((n) => String(n).padStart(2, '0')).join(' '));
    } finally { setSuggesting(false); }
  }
  // Preço livre: custo do registro (tabela da CAIXA confirmada pelo servidor, ou o valor digitado) e o plano de preço resultante.
  const registroCents: number | null = freeMode ? (automatic && !numbersLater ? (Number.isFinite(quote?.costCents) ? quote!.costCents : registroLocal) : toCents(manualCost)) : null;
  const priceIncomplete = (quotaMode === 'digitar' && !quotaValue.trim()) || (feeMode !== 'sobra' && !feeValue.trim());
  const plan = freeMode && !unlimited && registroCents !== null ? planPricing({ costCents: registroCents, shares: Math.trunc(Number(totalCotas)), quotaMode, quotaValue, feeMode, feeValue }) : null;
  const finiteRevenue = unlimited ? null : freeMode ? (plan?.ok ? plan.totalCents / 100 : null) : Number(totalCotas || 0) * Number(valorCota || 0);

  useEffect(() => {
    if (!contestId && availableContests[0]) setContestId(availableContests[0].id);
  }, [availableContests, contestId]);

  function resetAfterSave() {
    setNumbersLater(false); setAutomatic(true);
    setContestId('');
    setNumbers('');
    setTotalCotas('10');
    setUnlimited(false);
    setValorCota('20');
    setTaxa('10');
    setCusto('0');
    setQuotaMode('digitar'); setQuotaValue(''); setFeeMode('pct'); setFeeValue(''); setManualCost('');
    setDescription('');
    setConditional(false);
    setTrigger('100000000');
    setPresale(false); setSaleStart(''); setSaleEnd(''); setMaxPerPerson(''); setSaleText('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!selectedContest || (!editing && !selectedGroupId)) {
      setMessage('Selecione um concurso aberto e um grupo válido.');
      return;
    }
    if (!numbersLater && games.some(g => g.numeros.length < limits.min)) {
      setMessage(`Informe pelo menos ${limits.min} números válidos para ${modalityNames[modality] ?? modality}.`);
      return;
    }
    if (freeMode) {
      if (unlimited) { setMessage('Novos bolões precisam de um total finito de cotas.'); return; }
      if (registroCents === null) { setMessage(automatic ? 'Aguarde o cálculo do custo do registro ou desligue a tabela da CAIXA e informe o valor.' : 'Informe o custo total do registro na CAIXA.'); return; }
      if (!plan || !plan.ok) { setMessage(plan && !plan.ok ? plan.error : 'Revise o valor da cota e a taxa de serviço.'); return; }
    } else if (Number(valorCota) <= 0 || Number(taxa) < 0 || Number(taxa) > 35) {
      setMessage('Revise o valor da cota e a taxa administrativa.');
      return;
    }
    if (!unlimited && (!Number.isInteger(Number(totalCotas)) || Number(totalCotas) < 1)) {
      setMessage('Informe um total finito de cotas válido.');
      return;
    }

    if (conditional && !(Number(trigger) > 0)) {
      setMessage('Informe o valor de prêmio que libera as cotas (ex.: 100000000 para R$ 100 milhões).');
      return;
    }

    if (numbersLater && !freeMode) { setMessage('Números a definir só no modo de valor livre.'); return; }
    if (!automatic && !numbersLater && games.length > 1 && !editing) { setMessage('Para criar vários jogos com custos distintos, utilize a cotação automática.'); return; }
    if (!editing && automatic && !numbersLater && (!quote || !canPrice || unlimited)) { setMessage('Aguarde uma cotação válida.'); return; }
    setSaving(true);
    try {
      const salesRules = {
        vendaInicioEm: saleStart ? new Date(saleStart).toISOString() : null,
        vendaFimEm: saleEnd ? new Date(saleEnd).toISOString() : null,
        maxCotasPorPessoa: maxPerPerson.trim() ? Number(maxPerPerson) : null,
        regrasVenda: saleText.trim() || null,
        ...(role === 'admin' && (presale || editPool?.regrasVenda?.antecipada) ? { vendaAntecipada: presale } : {}),
      };
      if (salesRules.maxCotasPorPessoa !== null && (!Number.isInteger(salesRules.maxCotasPorPessoa) || salesRules.maxCotasPorPessoa < 1)) { setMessage('O limite por pessoa precisa ser um número inteiro de 1 em diante.'); setSaving(false); return; }
      if (saleStart && saleEnd && new Date(saleStart) >= new Date(saleEnd)) { setMessage('O início da venda precisa ser antes do fim.'); setSaving(false); return; }
      const body = editing && editPool?.precificacao ? { ...salesRules, ...(description.trim() ? { descricao: description.trim() } : {}) } : {
        ...salesRules,
        ...(editing ? {} : { concursoId: selectedContest.id, grupoId: selectedGroupId }),
        numerosApostados: numbersLater ? [] : uniqueNumbers,
        jogos: numbersLater ? [] : games.map((g, i) => ({ ...g, quantidadeDezenas: g.numeros.length, custo: Number(quote?.jogos[i]?.custo ?? editPool?.jogos?.[i]?.custo ?? (freeMode && !automatic && plan?.ok ? plan.costCents / 100 : custo) ?? 0) })),
        ...(!editing ? { precificacaoAutomatica: automatic && !numbersLater, totalCotadoCentavos: freeMode && plan?.ok ? plan.totalCents : quote?.totalCents } : {}),
        ...(freeMode && plan?.ok ? { precoLivre: true, taxaPorCotaCentavos: plan.feePerShare, ...(automatic && !numbersLater ? {} : { custoRegistroCentavos: plan.costCents }), ...(numbersLater ? { numerosADefinir: true } : {}) } : {}),
        ...(unlimited ? { cotasIlimitadas: true, totalCotas: undefined } : { cotasIlimitadas: false, totalCotas: Number(totalCotas) }),
        valorCota: freeMode && plan?.ok ? plan.quotaCents / 100 : Number(valorCota),
        taxaAdministracaoPct: freeMode && plan?.ok ? plan.feePct : Number(taxa),
        ...(conditional ? { premioMinimoLiberacao: Number(trigger) } : editing && editPool?.liberacao?.condicional ? { premioMinimoLiberacao: null } : {}),
        ...(description.trim() ? { descricao: description.trim() } : {}),
        ...(editing ? {} : { modeloOperacional: 'mandato' }),
      };
      const prefix = role === 'affiliate' ? '/api/v1/afiliados/me/boloes' : '/api/v1/admin/boloes';
      const path = editing ? `${prefix}/${editPool!.id}` : prefix;
      const response = await authFetch(path, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || (editing ? 'Não foi possível editar o bolão.' : 'Não foi possível criar o bolão.'));
      const warnings = Array.isArray(payload?.avisos) ? ` Atenção: ${payload.avisos.join(' ')}` : '';
      setMessage(editing ? 'Bolão atualizado com sucesso.' : numbersLater ? 'Bolão criado como rascunho, sem números. Publique para abrir a venda e defina os jogos depois, em Mais › Definir números.' : 'Bolão criado como rascunho.') + warnings;
      // Guarda os jogos no banco de números (e conta o uso). Se falhar, o bolão já foi criado e nada se perde.
      if (!editing && !numbersLater && role === 'admin' && canPrice) void authFetch('/api/v1/admin/numeros/usar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modalidade: modality, jogos: games.map((game) => ({ numeros: game.numeros })), ...(payload?.id ? { bolaoId: payload.id } : {}) }) }).catch(() => undefined);
      await onSuccess(editing ? undefined : payload);
      if (!editing) resetAfterSave();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar o bolão.');
    } finally {
      setSaving(false);
    }
  }

  return <form className="pool-wizard pool-wizard-simple" onSubmit={submit}>
    <div className="simple-form-heading"><div><span className="admin-eyebrow">{editing ? 'Edição rápida' : 'Criação rápida'}</span><h3>{editing ? 'Editar bolão' : 'Novo bolão'}</h3><p>{editing ? 'Atualize os dados enquanto o bolão estiver em rascunho ou aberto.' : 'Preencha os dados essenciais em uma única tela. O bolão nasce como rascunho.'}</p></div>{editing && <button type="button" className="admin-button admin-button-ghost" onClick={onCancelEdit}>Cancelar edição</button>}</div>
    {editing && editPool?.precificacao && <p>Este orçamento é imutável. Crie um novo bolão para recalcular os jogos e os valores.</p>}
    {message && <div className="admin-callout admin-callout-warning">{message}</div>}
    <div className="admin-form-grid admin-form-grid-three">
      {role === 'affiliate' && <label className="admin-field"><span>Grupo próprio</span><select value={selectedGroupId} disabled={editing} onChange={(event) => setSelectedGroupId(event.target.value)}><option value="">Selecione</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.nome}</option>)}</select></label>}
      <label className="admin-field"><span>Modalidade</span><select value={modality} disabled={editing} onChange={(event) => { setSpecialValue(''); setModality(event.target.value); setContestId(''); }}><option value="megasena">Mega-Sena</option><option value="lotofacil">Lotofácil</option><option value="quina">Quina</option><option value="lotomania">Lotomania</option><option value="duplasena">Dupla Sena</option><option value="timemania">Timemania</option><option value="diadesorte">Dia de Sorte</option><option value="supersete">Super Sete</option><option value="loteca">Loteca</option></select></label>
      <label className="admin-field admin-field-wide"><span>Concurso aberto</span><select value={contestId} disabled={editing} onChange={(event) => setContestId(event.target.value)}><option value="">Selecione</option>{availableContests.map((contest) => <option value={contest.id} key={contest.id}>{contest.nomeEspecial ? `${contest.nomeEspecial} · ` : ''}{concursoNo(contest.numeroConcurso) === 'a definir' ? 'número a definir' : `#${contest.numeroConcurso}`} · {dateOnly(contest.dataSorteio)}{contest.fonteSincronizacao === 'projetado' || contest.previsto ? ' (data prevista)' : ''} · prêmio {contest.valorEstimadoPremio ? money(contest.valorEstimadoPremio) : 'a definir'}</option>)}</select>{!selectedContest && <small>Nenhum concurso disponível para esta modalidade. Sincronize os concursos.</small>}</label>
      {!editing && (modality === 'timemania' || modality === 'diadesorte') && <label className="admin-field admin-field-wide"><span>{modality === 'timemania' ? 'Time do Coração dos jogos' : 'Mês de Sorte dos jogos'}</span>{modality === 'timemania'
        ? <input value={specialValue} maxLength={60} onChange={(event) => setSpecialValue(event.target.value)} placeholder="Ex.: Vasco da Gama/RJ" />
        : <select value={specialValue} onChange={(event) => setSpecialValue(event.target.value)}><option value="">Escolha o mês</option>{['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select>}
        <small>Vale para todos os jogos. É com isso que a apuração confere o prêmio do {modality === 'timemania' ? 'Time do Coração' : 'Mês de Sorte'}; sem isso, a equipe precisa conferir essa faixa à mão.</small></label>}
      {role === 'admin' && !editing && <div className="admin-field admin-field-wide festa-inline">
        <button type="button" className="admin-button" aria-expanded={newDate} onClick={() => setNewDate((value) => !value)}>{newDate ? 'Fechar' : 'Criar para uma data comemorativa (sem concurso aberto)'}</button>
        {newDate && <div className="festa-inline-body">
          <p className="admin-muted">Serve para Mega da Virada, Quina de São João, Lotofácil da Independência ou qualquer data. O concurso fica provisório e assume o número oficial quando a CAIXA publicar. Você já pode abrir a venda de cotas.</p>
          <div className="admin-form-grid admin-form-grid-three">
            <label className="admin-field"><span>Data comemorativa</span><select value={festaChoice} onChange={(event) => setFestaChoice(event.target.value)}>{modalityPresets.map((preset) => <option key={preset.chave} value={preset.chave}>{preset.nome}</option>)}<option value="personalizado">Outra data (informar nome)</option></select></label>
            {(festaChoice === 'personalizado' || !modalityPresets.some((preset) => preset.chave === festaChoice)) && <label className="admin-field"><span>Nome da data</span><input value={festaName} maxLength={80} onChange={(event) => setFestaName(event.target.value)} placeholder="Ex.: Quina do Natal" /></label>}
            <label className="admin-field"><span>Dia do sorteio</span><input type="date" value={festaDate} onChange={(event) => setFestaDate(event.target.value)} /></label>
            <label className="admin-field"><span>Hora do sorteio (Brasília)</span><input type="time" value={festaHora} onChange={(event) => setFestaHora(event.target.value)} /></label>
          </div>
          {festaSorteio && <p className="admin-note" role="status">{festaSorteio.confirmado ? 'Data confirmada pela CAIXA.' : `Data prevista, ainda não confirmada: ${festaSorteio.fonte.replace(/\.$/, '')}.`} As apostas fecham 1 hora antes do sorteio ou no horário padrão da modalidade, o que for mais cedo.</p>}
          <button type="button" className="admin-button admin-button-primary" disabled={festaBusy} onClick={() => void createDateContest()}>{festaBusy ? 'Criando…' : `Criar concurso de ${modalityNames[modality] ?? modality}`}</button>
        </div>}
      </div>}
      {freeMode && <label className="admin-toggle-row admin-field-wide"><input type="checkbox" checked={numbersLater} onChange={(event) => { setNumbersLater(event.target.checked); if (event.target.checked) { setAutomatic(false); setPresale(true); } else setAutomatic(true); }} /><span><strong>Números ainda não definidos (definir depois)</strong><small>Para datas comemorativas como a Mega da Virada: você abre a venda das cotas agora e informa os jogos antes do fechamento. Informe só o custo estimado do registro; a pré-venda é ligada para você.</small></span></label>}
      {canPrice && !editing && !numbersLater && <div className="admin-field admin-field-wide game-generator" aria-label="Gerador de jogos">
        <strong>Gerar jogos automaticamente</strong>
        <small className="admin-muted">Usa o histórico de sorteios da CAIXA para montar jogos variados. Não prevê resultado: todo jogo tem a mesma chance.</small>
        <div className="admin-form-grid admin-form-grid-four">
          <label className="admin-field"><span>Quantos jogos</span><input type="number" min={1} max={100} inputMode="numeric" value={genCount} onChange={(event) => setGenCount(event.target.value)} /><small>De 1 a 100 por bolão.</small></label>
          <label className="admin-field"><span>Números em cada jogo</span>{sizeOptions.length > 0 ? <select value={genSize} onChange={(event) => setGenSize(event.target.value)}>{sizeOptions.map((size) => <option key={size} value={size}>{size} números · {money((priceTable[`${modality}:${size}`] ?? 0) / 100)}</option>)}</select> : <input type="number" min={limits.min} value={genSize} onChange={(event) => setGenSize(event.target.value)} />}<small>Só aparecem as apostas que a CAIXA vende, com o preço oficial.</small></label>
          <label className="admin-field"><span>Como escolher</span><select value={genStrategy} onChange={(event) => setGenStrategy(event.target.value)}><option value="equilibrado">Equilibrado (evita padrões comuns)</option><option value="aleatorio">Totalmente aleatório</option><option value="quentes">Mais sorteados recentes</option><option value="atrasados">Mais atrasados</option><option value="misto">Misto</option></select></label>
          <div className="admin-field" style={{ alignSelf: 'end' }}><button type="button" className="admin-button admin-button-primary" disabled={generating} onClick={() => void generateGames()}>{generating ? 'Gerando…' : generated ? 'Gerar de novo' : 'Gerar jogos'}</button></div>
        </div>
        <div className="admin-form-grid admin-form-grid-three">
          <label className="admin-field"><span>Números que devem entrar (opcional)</span><input value={genFixed} onChange={(event) => setGenFixed(event.target.value)} placeholder="Ex.: 7, 10" inputMode="numeric" /></label>
          <label className="admin-field"><span>Números para evitar (opcional)</span><input value={genExclude} onChange={(event) => setGenExclude(event.target.value)} placeholder="Ex.: 13" inputMode="numeric" /></label>
        </div>
        <div className="generator-cost" aria-live="polite">
          {previewTotal === null ? <span>Valor do registro na CAIXA: confira a tabela de preços.</span> : <span>Registro na CAIXA: <strong>{money(unitCents! / 100)}</strong> por jogo de {sizeNumber} números · <strong>{gameCountNumber} {gameCountNumber === 1 ? 'jogo' : 'jogos'} = {money(previewTotal / 100)}</strong></span>}
        </div>
        {!freeMode && localQuote && <div className="generator-cost" aria-live="polite"><span>Custo dos {games.length} {games.length === 1 ? 'jogo' : 'jogos'}: <strong>{money(localQuote.cost / 100)}</strong> · com {localQuote.shares} {localQuote.shares === 1 ? 'cota' : 'cotas'} e taxa de {taxa || 0}%: <strong>{money(localQuote.quotaCents / 100)} por cota</strong> (já preenchido abaixo)</span></div>}
        {genError && <p role="alert" className="form-error">{genError}</p>}
        {generated && <div className="generator-result"><span>{generated.quantidade} {generated.quantidade === 1 ? 'jogo gerado' : 'jogos gerados'} · {generated.dezenas} números cada · <strong>total na CAIXA {money(generated.custoTotal)}</strong></span><small>{generated.aviso}</small></div>}
      </div>}
      {role === 'admin' && !editing && canPrice && !numbersLater && <BankPicker modalidade={modality} onUse={(lines, mode) => setNumbers((current) => (mode === 'append' && current.trim() ? `${current.trim()}\n${lines.join('\n')}` : lines.join('\n')))} />}
      {!numbersLater && <label className="admin-field admin-field-wide"><span>Jogos — um por linha</span><textarea rows={5} value={numbers} onChange={(event) => setNumbers(event.target.value)} placeholder="Ex.: 04 12 23 35 44 58" /><small>{uniqueNumbers.length}/{limits.min} mínimos · separe por espaço, vírgula ou ponto e vírgula.</small>{!['loteca', 'supersete'].includes(modality) && <button type="button" className="button button-ghost" style={{ justifySelf: 'start', marginTop: 6 }} disabled={suggesting} onClick={() => void suggestGame()}>{suggesting ? 'Gerando…' : 'Sugerir jogo equilibrado'}</button>}<small>A sugestão evita padrões populares e usa soma/paridade típicas; não aumenta a chance de acerto.</small></label>}
    </div>
    {!editing && !numbersLater && <label className="admin-toggle-row"><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} /><span><strong>{freeMode ? 'Calcular o custo do registro pela tabela da CAIXA' : 'Calcular pela tabela Caixa'}</strong><small>{freeMode ? 'A tabela só mostra quanto custa registrar os jogos na CAIXA. O valor da cota e a taxa você define livremente, abaixo.' : 'Custo dos jogos + administração sobre o custo. Cotas finitas; ajuste de centavos explicitado.'}</small></span></label>}
    {automatic && !canPrice && <p role="alert">Matriz disponível na API. Venda automática desta modalidade aguarda suporte à apuração completa.</p>}
    {quoteError && <p role="alert">{quoteError}</p>}
    {quote && !freeMode && quote.jogos?.length > 0 && <div className="simple-form-summary" aria-label="Custo de cada jogo"><span>Jogos <strong>{quote.jogos.length}</strong></span><span>Custo por jogo <strong>{[...new Set(quote.jogos.map((g: RecordValue) => money(g.custo)))].join(' / ')}</strong></span><span>Registro na CAIXA <strong>{money(quote.costCents / 100)}</strong></span></div>}
    {quote && !freeMode && <div className="simple-form-summary" aria-live="polite"><span>Bilhetes <strong>{money(quote.costCents / 100)}</strong></span><span>Administração <strong>{money(quote.adminTotalCents / 100)}</strong></span><span>Reserva de arredondamento <strong>{money(quote.roundingReserveCents / 100)}</strong></span><span>Por cota: bilhete {money(quote.ticketPerShare / 100)} + taxa {money(quote.feePerShare / 100)}</span></div>}
        {freeMode ? <fieldset className="price-free" aria-label="Preço da cota e taxa de serviço">
      <legend>Preço da cota e taxa de serviço</legend>
      {!automatic && <label className="admin-field"><span>Custo total do registro na CAIXA (R$)</span><input type="text" inputMode="decimal" value={manualCost} onChange={(event) => setManualCost(event.target.value)} placeholder="Ex.: 60,00" /></label>}
      <div className="price-free-mode" role="radiogroup" aria-label="Como definir o valor da cota">
        <label className={quotaMode === 'digitar' ? 'is-on' : ''}><input type="radio" name="quota-mode" checked={quotaMode === 'digitar'} onChange={() => setQuotaMode('digitar')} /><span><strong>Eu defino o valor da cota</strong><small>Digite o preço que quiser; a taxa é separada dele.</small></span></label>
        <label className={quotaMode === 'registro' ? 'is-on' : ''}><input type="radio" name="quota-mode" checked={quotaMode === 'registro'} onChange={() => { setQuotaMode('registro'); if (feeMode === 'sobra') setFeeMode('pct'); }} /><span><strong>Custo da cota = registro ÷ cotas</strong><small>O sistema soma a taxa de serviço em cima do registro de cada cota.</small></span></label>
      </div>
      <div className="price-free-fields">
        <label className="admin-field"><span>Quantidade de cotas</span><input type="number" min="1" step="1" inputMode="numeric" value={totalCotas} onChange={(event) => setTotalCotas(event.target.value)} /></label>
        <label className="admin-field"><span>Valor da cota (R$){quotaMode === 'registro' ? ' · calculado' : ''}</span>{quotaMode === 'digitar'
          ? <input type="text" inputMode="decimal" value={quotaValue} onChange={(event) => setQuotaValue(event.target.value)} placeholder="Ex.: 20,00" />
          : <input type="text" readOnly value={plan?.ok ? (plan.quotaCents / 100).toFixed(2).replace('.', ',') : ''} placeholder="—" />}</label>
        <div className="admin-field"><span>Taxa de serviço</span><div className="price-free-fee">
          <select aria-label="Como informar a taxa" value={feeMode} onChange={(event) => setFeeMode(event.target.value as FeeMode)}><option value="pct">% da cota</option><option value="cota">R$ por cota</option><option value="total">R$ do bolão todo</option><option value="sobra" disabled={quotaMode === 'registro'}>Sobra do registro</option></select>
          {feeMode === 'sobra' ? <input type="text" readOnly value={plan?.ok ? (plan.feePerShare / 100).toFixed(2).replace('.', ',') : ''} placeholder="Automática" aria-label="Taxa por cota (automática)" /> : <input type="text" inputMode="decimal" aria-label="Valor da taxa" value={feeValue} onChange={(event) => setFeeValue(event.target.value)} placeholder={feeMode === 'pct' ? 'Ex.: 10' : 'Ex.: 2,00'} />}
        </div></div>
      </div>
      {plan && !plan.ok && !priceIncomplete && <p role="alert" className="form-error">{plan.error}</p>}
      {(registroCents === null || (plan && !plan.ok && priceIncomplete)) && <p className="admin-muted">{registroCents === null ? (automatic ? 'O registro aparece quando houver jogos válidos.' : 'Informe o custo total do registro para ver a conta.') : 'Preencha o valor da cota e a taxa para ver a conta.'}</p>}
      {plan?.ok && <>
        <div className="price-free-result" aria-live="polite">
          <div className="is-main"><span>Valor da cota</span><strong>{money(plan.quotaCents / 100)}</strong></div>
          <div className="is-main"><span>Taxa de serviço por cota</span><strong>{money(plan.feePerShare / 100)} <small>({String(plan.feePct).replace('.', ',')}%)</small></strong></div>
          <div><span>Custo por cota (fica no bolão)</span><strong>{money(plan.ticketPerShare / 100)}</strong></div>
          <div className="is-main"><span>Valor total do jogo</span><strong>{money(plan.totalCents / 100)}</strong><small>{plan.shares} {plan.shares === 1 ? 'cota' : 'cotas'} × {money(plan.quotaCents / 100)}</small></div>
        </div>
        <p className="price-free-detail">Registro na CAIXA <strong>{money(plan.costCents / 100)}</strong> ({money(plan.registroPerShare / 100)} por cota) · Taxa de serviço total <strong>{money(plan.feeTotalCents / 100)}</strong>{plan.surplusCents > 0 && <> · Sobra além do registro <strong>{money(plan.surplusCents / 100)}</strong></>}</p>
      </>}
      {plan?.ok && plan.feePct > 35 && <p className="admin-callout admin-callout-warning">A taxa de serviço está em {String(plan.feePct).replace('.', ',')}% da cota, acima de 35%, que é o limite dos afiliados e do modelo antigo. Como administrador você pode seguir. Só confira se está de acordo com o combinado com os participantes.</p>}
    </fieldset> : <div className="admin-form-grid admin-form-grid-four">
      <label className="admin-field"><span>Valor da cota (R$)</span><input readOnly={automatic} type="number" min="0.01" step="0.01" value={valorCota} onChange={(event) => setValorCota(event.target.value)} /></label>
      <label className="admin-field"><span>Taxa administrativa (%)</span><input type="number" min="0" max="35" step="0.01" value={taxa} onChange={(event) => setTaxa(event.target.value)} /></label>
      <label className={`admin-field ${unlimited ? 'is-disabled' : ''}`}><span>Total de cotas</span><input type="number" min="1" max={groupCapacity ?? undefined} value={totalCotas} disabled={unlimited} onChange={(event) => setTotalCotas(event.target.value)} />{groupCapacity !== null && <small>{groupCapacity > 0 ? `Seu grupo tem ${groupCapacity} ${groupCapacity === 1 ? 'pessoa' : 'pessoas'}: o bolão pode ter no máximo ${groupCapacity} cotas.` : 'Seu grupo ainda não tem pessoas. Convite alguém para o grupo antes de criar o bolão.'}</small>}</label>
      <label className="admin-field"><span>Custo total dos jogos (R$)</span><input readOnly={automatic} type="number" min="0" step="0.01" value={custo} onChange={(event) => setCusto(event.target.value)} /></label>
    </div>}
    {editing && <label className="admin-toggle-row"><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} /><span><strong>Cotas ilimitadas</strong><small>Permite reservas sem estoque máximo. Opção legada, indisponível para novos lotes.</small></span></label>}
    <label className="admin-toggle-row"><input type="checkbox" checked={conditional} onChange={(event) => setConditional(event.target.checked)} /><span><strong>Bolão condicional (liberar cotas só com prêmio alto)</strong><small>As cotas ficam bloqueadas até o prêmio estimado do concurso atingir o valor abaixo. Quando atingir, as vendas abrem sozinhas.</small></span></label>
    {conditional && <label className="admin-field"><span>Liberar cotas quando o prêmio estimado chegar a (R$)</span><input type="number" min="1" step="1" value={trigger} onChange={(event) => setTrigger(event.target.value)} /><small>{money(trigger)} · prêmio estimado atual do concurso: {selectedContest ? money(selectedContest.valorEstimadoPremio) : '—'}</small></label>}
    <fieldset className="sales-rules">
      <legend>Regras de venda</legend>
      <p className="admin-muted">Opcional. Defina quando as cotas ficam à venda e o limite por pessoa. Sem datas, a venda vale até o prazo do concurso.</p>
      <div className="admin-form-grid admin-form-grid-three">
        <label className="admin-field"><span>Venda começa em</span><input type="datetime-local" value={saleStart} onChange={(event) => setSaleStart(event.target.value)} /></label>
        <label className="admin-field"><span>Venda termina em</span><input type="datetime-local" value={saleEnd} onChange={(event) => setSaleEnd(event.target.value)} /></label>
        <label className="admin-field"><span>Máximo de cotas por pessoa</span><input type="number" min="1" step="1" inputMode="numeric" value={maxPerPerson} onChange={(event) => setMaxPerPerson(event.target.value)} placeholder="Sem limite" /></label>
      </div>
      <label className="admin-field"><span>Regras para o cliente (aparecem no bolão)</span><textarea rows={3} maxLength={2000} value={saleText} onChange={(event) => setSaleText(event.target.value)} placeholder="Ex.: Cotas de R$ 10. O jogo é registrado após o encerramento das vendas e o comprovante é enviado a todos." /></label>
      {role === 'admin' && <label className="admin-toggle-row"><input type="checkbox" checked={presale} disabled={editing && Boolean(editPool?.cotasVendidas)} onChange={(event) => setPresale(event.target.checked)} /><span><strong>Pré-venda (vender antes de registrar o jogo)</strong><small>As cotas são vendidas sem comprovante prévio. Depois de registrar a aposta na lotérica, o comprovante é enviado a todos os cotistas. Use para datas comemorativas antes de o concurso abrir.</small></span></label>}
    </fieldset>
    <label className="admin-field"><span>Descrição pública</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explique a estratégia, transparência e operação do bolão." /></label>
    <div className="simple-form-summary"><span>Concurso <strong>{selectedContest ? (selectedContest.nomeEspecial ? `${selectedContest.nomeEspecial}${selectedContest.numeroConcurso > 0 ? ` #${selectedContest.numeroConcurso}` : ' (número a definir)'}` : `#${selectedContest.numeroConcurso}`) : '—'}</strong></span><span>Disponibilidade <strong>{unlimited ? 'Ilimitada' : `${totalCotas || 0} cotas`}</strong></span><span>Receita prevista <strong>{finiteRevenue === null ? 'Sob demanda' : money(finiteRevenue)}</strong></span></div>
    {role === 'admin' && <LotteryPriceAdmin />}
    <div className="wizard-actions"><button className="admin-button admin-button-primary" disabled={saving || (!editing && automatic && !quote) || (freeMode && !plan?.ok)}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar bolão'}</button></div>
  </form>;
}
