'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Panel } from './admin-ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Notify = (type: 'success' | 'error', text: string) => void;
type Preset = { chave: string; nome: string; modalidade: string; proximoSorteio?: { data: string; hora: string; confirmado: boolean; fonte: string } | null };

async function call(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message ?? 'Não foi possível concluir.');
  return data as any;
}

const MODALIDADES: Array<[string, string]> = [['megasena', 'Mega-Sena'], ['lotofacil', 'Lotofácil'], ['quina', 'Quina'], ['duplasena', 'Dupla Sena'], ['lotomania', 'Lotomania'], ['timemania', 'Timemania'], ['diadesorte', 'Dia de Sorte'], ['supersete', 'Super Sete'], ['loteca', 'Loteca']];

/** Cria concurso de festa (Mega da Virada, São João...) mesmo sem número oficial nem prêmio previsto. */
export function FestivalForm({ onDone, notify }: { onDone: () => Promise<void> | void; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [choice, setChoice] = useState('mega-da-virada');
  const [day, setDay] = useState('');
  const [hour, setHour] = useState('20:00');
  useEffect(() => { if (open && !presets.length) call('/api/v1/admin/concursos/festas').then((data) => setPresets(data as Preset[])).catch(() => setPresets([])); }, [open, presets.length]);

  const preset = presets.find((item) => item.chave === choice);
  const known = preset?.proximoSorteio ?? null;
  // Ao escolher a festa, o dia e a hora do sorteio já vêm preenchidos (dá para ajustar).
  useEffect(() => { if (known) { setDay(known.data); setHour(known.hora); } else if (choice === 'personalizado') { setDay(''); setHour('20:00'); } }, [known?.data, known?.hora, choice]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const number = String(form.get('numeroConcurso') ?? '').trim();
    const prize = String(form.get('valorEstimadoPremio') ?? '').replace(/\./g, '').replace(',', '.').trim();
    try {
      await call('/api/v1/admin/concursos/festa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        especial: choice, dataSorteio: day, horaSorteio: hour || '20:00',
        ...(choice === 'personalizado' ? { modalidade: String(form.get('modalidade')), nomeEspecial: String(form.get('nomeEspecial') ?? '').trim() } : {}),
        ...(number ? { numeroConcurso: Number(number) } : {}), ...(prize ? { valorEstimadoPremio: Number(prize) } : {}),
      }) });
      notify('success', 'Concurso de festa criado. Já dá para criar bolões nele.'); setOpen(false); await onDone();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }

  if (!open) return <button className="admin-button admin-button-primary" onClick={() => setOpen(true)}>+ Concurso de festa (Mega da Virada, São João…)</button>;
  return <Panel title="Concurso de festa" action={<button className="admin-button admin-button-small admin-button-ghost" onClick={() => setOpen(false)}>Fechar</button>}>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
      <label className="admin-field"><span>Qual festa?</span><select value={choice} onChange={(event) => setChoice(event.target.value)}>{presets.map((preset) => <option key={preset.chave} value={preset.chave}>{preset.nome}</option>)}<option value="personalizado">Outra (digitar)</option></select></label>
      {choice === 'personalizado' && <><label className="admin-field"><span>Jogo</span><select name="modalidade" required>{MODALIDADES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label className="admin-field"><span>Nome da festa</span><input name="nomeEspecial" maxLength={80} required placeholder="Ex.: Quina do Natal" /></label></>}
      <label className="admin-field"><span>Dia do sorteio</span><input name="dataSorteio" type="date" required value={day} onChange={(event) => setDay(event.target.value)} /></label>
      <label className="admin-field"><span>Hora do sorteio (Brasília)</span><input name="horaSorteio" type="time" required value={hour} onChange={(event) => setHour(event.target.value)} /></label>
      {known && <p className="admin-note" role="status" style={{ gridColumn: '1 / -1', margin: 0 }}>{known.confirmado ? 'Dia e hora confirmados pela CAIXA.' : `Data prevista, ainda não confirmada: ${known.fonte.replace(/\.$/, '')}.`} As apostas fecham 1 hora antes do sorteio ou no horário padrão da modalidade, o que for mais cedo.</p>}
      <label className="admin-field"><span>Número do concurso (se já souber)</span><input name="numeroConcurso" type="number" min={1} placeholder="Deixe vazio se ainda não saiu" /></label>
      <label className="admin-field"><span>Prêmio estimado (R$, se já souber)</span><input name="valorEstimadoPremio" inputMode="decimal" placeholder="Deixe vazio se ainda não saiu" /></label>
      <div style={{ alignSelf: 'end' }}><button className="admin-button admin-button-primary" disabled={busy}>{busy ? 'Criando…' : 'Criar concurso'}</button></div>
    </form>
  </Panel>;
}

/** Informa o número oficial (ou o prêmio) de um concurso de festa que ainda está "a definir". */
export function FestivalNumberEditor({ contest, onDone, notify }: { contest: any; onDone: () => Promise<void> | void; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const number = String(form.get('numeroConcurso') ?? '').trim();
    const prize = String(form.get('valorEstimadoPremio') ?? '').replace(/\./g, '').replace(',', '.').trim();
    try {
      await call(`/api/v1/admin/concursos/${contest.id}/festa`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(number ? { numeroConcurso: Number(number) } : {}), ...(prize ? { valorEstimadoPremio: Number(prize) } : {}) }) });
      notify('success', 'Concurso atualizado.'); setOpen(false); await onDone();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  if (!open) return <button className="admin-text-button" onClick={() => setOpen(true)}>Informar número / prêmio</button>;
  return <form onSubmit={submit} style={{ display: 'grid', gap: 6, marginTop: 6, minWidth: 190 }}>
    {contest.numeroDefinido === false && <input name="numeroConcurso" type="number" min={1} placeholder="Número oficial" aria-label="Número oficial do concurso" />}
    <input name="valorEstimadoPremio" inputMode="decimal" placeholder="Prêmio estimado (R$)" aria-label="Prêmio estimado" />
    <div className="admin-row-actions"><button className="admin-button admin-button-small admin-button-primary" disabled={busy}>{busy ? '…' : 'Salvar'}</button><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => setOpen(false)}>Cancelar</button></div>
  </form>;
}

/** Remove uma data de festa que ainda não tem bolão (ex.: data criada por engano). */
export function FestivalRemoveButton({ contest, onDone, notify }: { contest: any; onDone: () => Promise<void> | void; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    const name = `${contest.nomeEspecial ?? 'Concurso de festa'} (${new Date(contest.dataSorteio).toLocaleDateString('pt-BR')})`;
    if (!window.confirm(`Remover ${name}? Isso só é possível se não houver bolão nesta data.`)) return;
    setBusy(true);
    try { await call(`/api/v1/admin/concursos/${contest.id}/festa`, { method: 'DELETE' }); notify('success', 'Data de festa removida.'); await onDone(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível remover.'); }
    finally { setBusy(false); }
  }
  return <button type="button" className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => void remove()}>{busy ? 'Removendo…' : 'Remover'}</button>;
}
