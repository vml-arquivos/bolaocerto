'use client';

import { useMemo, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';

type Loaded = { url: string; name: string; type: string };

/** Busca o arquivo (com o login da pessoa) e devolve um endereço local para abrir, baixar ou imprimir. */
async function load(path: string, fallbackName: string): Promise<Loaded> {
  const response = await authenticatedFetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível abrir o arquivo.');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ?? '') || /filename="([^"]+)"/i.exec(disposition)?.[1] || fallbackName;
  const type = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!;
  const blob = new Blob([await response.arrayBuffer()], { type });
  return { url: URL.createObjectURL(blob), name, type };
}

const release = (url: string, ms = 120000) => window.setTimeout(() => URL.revokeObjectURL(url), ms);

export async function viewDocument(path: string, fallbackName = 'documento') {
  const tab = window.open('', '_blank'); // abre já no clique, para o navegador não bloquear
  try { const file = await load(path, fallbackName); if (tab) tab.location.href = file.url; else window.location.href = file.url; release(file.url); }
  catch (error) { tab?.close(); throw error; }
}

export async function downloadDocument(path: string, fallbackName = 'documento') {
  const file = await load(path, fallbackName);
  const anchor = document.createElement('a');
  anchor.href = file.url; anchor.download = file.name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  release(file.url, 10000);
}

/** Imprime direto: carrega o arquivo numa moldura invisível e chama a impressão. Se o aparelho não deixar, abre o arquivo para imprimir de lá. */
export async function printDocument(path: string, fallbackName = 'documento') {
  const file = await load(path, fallbackName);
  if (file.type === 'application/xml' || file.type === 'text/xml') { const anchor = document.createElement('a'); anchor.href = file.url; anchor.download = file.name; anchor.click(); release(file.url, 10000); return; }
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.src = file.url;
  frame.onload = () => {
    window.setTimeout(() => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
      catch { window.open(file.url, '_blank'); }
      window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(file.url); }, 60000);
    }, 250);
  };
  document.body.appendChild(frame);
}

/**
 * Botões de um documento: Ver (abre na tela), Baixar e Imprimir — sempre na própria linha, sem abrir detalhe.
 * `extra` acrescenta outro formato (ex.: XML da nota).
 */
export function DocActions({ path, name, variant = 'admin', extra, onError }: { path: string; name: string; variant?: 'admin' | 'site'; extra?: { label: string; path: string; name: string }; onError?: (message: string) => void }) {
  const [busy, setBusy] = useState('');
  const base = variant === 'admin' ? 'admin-button admin-button-small' : 'button button-secondary button-small';
  async function act(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    try { await fn(); }
    catch (error) { const message = error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.'; if (onError) onError(message); else window.alert(message); }
    finally { setBusy(''); }
  }
  return <div className="doc-actions" role="group" aria-label={`Ações do documento ${name}`}>
    <button type="button" className={`${base} doc-view`} disabled={Boolean(busy)} onClick={() => void act('ver', () => viewDocument(path, name))} title="Abrir na tela">{busy === 'ver' ? 'Abrindo…' : 'Ver'}</button>
    <button type="button" className={`${base} doc-download`} disabled={Boolean(busy)} onClick={() => void act('baixar', () => downloadDocument(path, name))} title="Salvar no aparelho">{busy === 'baixar' ? 'Baixando…' : 'Baixar'}</button>
    <button type="button" className={`${base} doc-print`} disabled={Boolean(busy)} onClick={() => void act('imprimir', () => printDocument(path, name))} title="Imprimir direto">{busy === 'imprimir' ? 'Preparando…' : 'Imprimir'}</button>
    {extra && <button type="button" className={`${base} doc-extra`} disabled={Boolean(busy)} onClick={() => void act('extra', () => downloadDocument(extra.path, extra.name))} title={`Baixar ${extra.label}`}>{busy === 'extra' ? 'Baixando…' : extra.label}</button>}
  </div>;
}

/** Busca e páginas para listas de documentos: mostra poucos por vez, com busca por texto. */
export function usePagedSearch<T>(items: T[], text: (item: T) => string, pageSize = 25) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const words = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((item) => { const hay = text(item).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return words.every((word) => hay.includes(word)); });
  }, [items, query, text]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  return { query, setQuery: (value: string) => { setQuery(value); setPage(1); }, page: current, pages, setPage, visible, total: filtered.length, all: items.length };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="doc-search"><span className="sr-only">Buscar</span><input type="search" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function Pager({ page, pages, total, all, onPage }: { page: number; pages: number; total: number; all: number; onPage: (page: number) => void }) {
  if (all === 0) return null;
  return <div className="doc-pager">
    <small>{total === all ? `${total} ${total === 1 ? 'item' : 'itens'}` : `${total} de ${all}`}{pages > 1 ? ` · página ${page} de ${pages}` : ''}</small>
    {pages > 1 && <div><button type="button" className="admin-button admin-button-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Anterior</button><button type="button" className="admin-button admin-button-small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima ›</button></div>}
  </div>;
}
