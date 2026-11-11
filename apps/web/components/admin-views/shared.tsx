'use client';

import type { ReactNode } from 'react';
import { authenticatedFetch as authFetch } from '../../lib/client-api';
import { formatBRL } from '../../lib/format';

/* Tipos, funções e peças visuais compartilhadas pelas telas do painel administrativo. */
export type RecordValue = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type PagePayload = { items?: RecordValue[]; pagination?: { page: number; pageSize: number; total: number; pages: number } };
export type DashboardPayload = { kpis: RecordValue; graficos?: { recebimentos?: RecordValue[] }; proximosCutoffs?: RecordValue[] };
export type ToastState = { type: 'success' | 'error'; text: string } | null;

/** Tudo o que as telas precisam do painel: dados da tela atual, estado dos filtros e as ações. */
export type AdminCtx = {
  view: string;
  items: RecordValue[];
  payload: PagePayload;
  kpis: RecordValue;
  chart: RecordValue[];
  chartMax: number;
  dashboard: DashboardPayload | null;
  period: string; setPeriod: (value: string) => void;
  busy: boolean;
  superAdmin: boolean;
  contestScope: 'aberto' | 'festas' | 'historico'; setContestScope: (value: 'aberto' | 'festas' | 'historico') => void;
  contestMonth: string; setContestMonth: (value: string) => void;
  page: number; setPage: (value: number | ((current: number) => number)) => void;
  showPoolForm: boolean; setShowPoolForm: (value: boolean | ((current: boolean) => boolean)) => void;
  editingPool: RecordValue | null; setEditingPool: (value: RecordValue | null) => void;
  contests: RecordValue[];
  groupId: string | null;
  affiliateOptions: RecordValue[];
  selectedCommissions: string[]; setSelectedCommissions: (value: string[] | ((current: string[]) => string[])) => void;
  roleTab: 'equipe' | 'afiliado' | 'cotista' | 'todos'; setRoleTab: (value: 'equipe' | 'afiliado' | 'cotista' | 'todos') => void;
  groupMembers: { id: string; nome: string; total: number; membros: RecordValue[] } | null;
  setGroupMembers: (value: { id: string; nome: string; total: number; membros: RecordValue[] } | null) => void;
  gamesTab: 'bolaos' | 'banco'; setGamesTab: (value: 'bolaos' | 'banco') => void;
  setPoolFor: (value: RecordValue | null) => void;
  setAttachFor: (value: { pool: RecordValue; share?: RecordValue } | null) => void;
  setSelectedUser: (value: string | null) => void;
  setToast: (value: ToastState) => void;
  load: (quiet?: boolean) => Promise<void>;
  execute: (path: string, options: RequestInit, success: string) => Promise<void>;
  notify: (type: 'success' | 'error', text: string) => void;
  syncContests: () => Promise<void>;
  importHistory: () => Promise<void>;
};

export const money = formatBRL;

/** Formato que a janela de comprovantes entende, vindo do bolão criado, da lista de bolões ou da fila de operação. */
export function poolForAttachments(pool: RecordValue): RecordValue {
  const contest = pool.concurso && typeof pool.concurso === 'object' ? pool.concurso : null;
  return { ...pool, status: pool.status ?? 'rascunho', modalidade: pool.modalidade ?? contest?.modalidade, concurso: contest ? contest.numeroConcurso : pool.concurso, nomeEspecial: pool.nomeEspecial ?? contest?.nomeEspecial ?? null };
}

export function dateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function dateOnly(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

export function statusLabel(status: unknown) {
  return String(status ?? '—').replaceAll('_', ' ').replaceAll('-', ' ');
}

export function statusClass(status: unknown) {
  const normalized = String(status ?? '').toLowerCase();
  if (['paga', 'pago', 'confirmado', 'aprovado', 'registrado', 'apurado', 'ativo'].includes(normalized)) return 'status-chip status-success';
  if (['pendente', 'reservada', 'rascunho'].includes(normalized)) return 'status-chip status-warning';
  if (['falhou', 'cancelada', 'cancelado', 'reprovado', 'estornado', 'inativo'].includes(normalized)) return 'status-chip status-danger';
  if (['aberto', 'fechado'].includes(normalized)) return 'status-chip status-info';
  return 'status-chip';
}

export async function fetchAdmin(path: string, options?: RequestInit) {
  const response = await authFetch(path, options);
  if (response.status === 401) {
    window.location.href = '/admin/entrar';
    throw new Error('Sessão expirada.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível carregar os dados.');
  return payload;
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="admin-page-heading"><div><h1>{title}</h1></div>{action}</div>;
}

export function Kpi({ label, value, hint, tone = 'blue' }: { label: string; value: string | number; hint?: string; tone?: 'blue' | 'violet' | 'green' | 'amber' | 'rose' }) {
  return <article className={`admin-kpi admin-kpi-${tone}`}><span className="admin-kpi-icon" aria-hidden="true">{tone === 'green' ? '↗' : tone === 'amber' ? '!' : tone === 'rose' ? '◎' : tone === 'violet' ? '◆' : '◌'}</span><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

export function Panel({ title, description, action, children, className = '' }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`admin-panel ${className}`}><div className="admin-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return <div className="admin-empty"><span>BL</span><strong>{title}</strong>{description && <p>{description}</p>}</div>;
}

export function Table({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth }}>{children}</table></div>;
}
