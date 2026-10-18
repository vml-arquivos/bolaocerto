'use client';

import { ReactNode, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Rec = Record<string, any>;
export type Notify = (type: 'success' | 'error', text: string) => void;

export const brl = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
export const dateTime = (value: unknown) => (value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(String(value))) : '—');
export const dateOnly = (value: unknown) => (value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(String(value))) : '—');
export const label = (value: unknown) => String(value ?? '—').replaceAll('_', ' ');
export const modalityNames: Record<string, string> = { megasena: 'Mega-Sena', lotofacil: 'Lotofácil', quina: 'Quina', lotomania: 'Lotomania', duplasena: 'Dupla Sena', timemania: 'Timemania', diadesorte: 'Dia de Sorte', supersete: 'Super Sete', loteca: 'Loteca' };

export function chip(status: unknown) {
  const s = String(status ?? '').toLowerCase();
  if (['paga', 'pago', 'confirmado', 'registrada', 'apurada', 'premiada', 'emitida', 'sim', 'aberto', 'liberado'].includes(s)) return 'status-chip status-success';
  if (['pendente', 'reservada', 'reservada (vencida)', 'sem cobrança', 'aguardando', 'rascunho'].includes(s)) return 'status-chip status-warning';
  if (['falhou', 'cancelada', 'estornado', 'estornada', 'erro', 'cancelado'].includes(s)) return 'status-chip status-danger';
  return 'status-chip';
}

export async function authFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  return response;
}

export async function api<T = Rec>(path: string, options?: RequestInit): Promise<T> {
  const response = await authFetch(path, options);
  if (response.status === 401) { window.location.href = '/login?next=/admin'; throw new Error('Sessão expirada.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível concluir a operação.');
  return payload as T;
}

export async function downloadFile(path: string, fallbackName = 'arquivo') {
  const response = await authFetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Falha ao gerar o arquivo.');
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function Kpi({ label: title, value, hint, tone = 'blue' }: { label: string; value: string | number; hint?: string; tone?: 'blue' | 'violet' | 'green' | 'amber' | 'rose' }) {
  return <article className={`admin-kpi admin-kpi-${tone}`}><span className="admin-kpi-icon" aria-hidden="true">{tone === 'green' ? '↗' : tone === 'amber' ? '!' : tone === 'rose' ? '◎' : tone === 'violet' ? '◆' : '◌'}</span><div><span>{title}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

export function Table({ children, minWidth = 900 }: { children: ReactNode; minWidth?: number }) {
  return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth }}>{children}</table></div>;
}

export function Empty({ text, hint }: { text: string; hint?: string }) {
  return <div className="admin-empty"><span>BL</span><strong>{text}</strong>{hint && <p>{hint}</p>}</div>;
}

export function Progress({ value, tone = 'blue' }: { value: number | null | undefined; tone?: 'blue' | 'green' | 'amber' }) {
  const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
  return <div className={`admin-progress admin-progress-${tone}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>;
}

/** Botões de exportação (PDF, planilha XLSX e CSV) para qualquer rota de relatório do painel. */
export function ExportBar({ path, params = {}, id, onError, small = true }: { path: string; params?: Record<string, string>; id: string; onError?: (message: string) => void; small?: boolean }) {
  const [busy, setBusy] = useState('');
  async function run(format: 'pdf' | 'xlsx' | 'csv') {
    setBusy(format);
    try {
      const search = new URLSearchParams({ ...params, formato: format });
      await downloadFile(`${path}${path.includes('?') ? '&' : '?'}${search.toString()}`, `${id}.${format}`);
    } catch (failure) { onError?.(failure instanceof Error ? failure.message : 'Falha ao exportar.'); }
    finally { setBusy(''); }
  }
  const size = small ? 'admin-button admin-button-small' : 'admin-button';
  return <div className="admin-row-actions" aria-label="Exportar">
    <button className={`${size} admin-button-secondary`} disabled={Boolean(busy)} onClick={() => void run('pdf')}>{busy === 'pdf' ? 'Gerando…' : 'PDF'}</button>
    <button className={size} disabled={Boolean(busy)} onClick={() => void run('xlsx')}>{busy === 'xlsx' ? 'Gerando…' : 'Planilha (XLSX)'}</button>
    <button className={`${size} admin-button-ghost`} disabled={Boolean(busy)} onClick={() => void run('csv')}>{busy === 'csv' ? 'Gerando…' : 'CSV'}</button>
  </div>;
}

export function ReleaseBadge({ release }: { release?: Rec | null }) {
  if (!release?.condicional) return null;
  return <span className={release.liberado ? 'status-chip status-success' : 'status-chip status-warning'} title={release.mensagem ?? ''}>{release.liberado ? 'cotas liberadas' : `libera com ${brl(release.gatilho)}`}</span>;
}
