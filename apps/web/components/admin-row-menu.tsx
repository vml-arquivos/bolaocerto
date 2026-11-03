'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type RowMenuItem = { label: string; onClick?: () => void; href?: string; danger?: boolean; hidden?: boolean; disabled?: boolean; hint?: string };

/**
 * Menu "Mais ações" de uma linha de tabela. Abre por cima da tabela (fora da rolagem), vira para cima
 * quando falta espaço embaixo, fecha com Esc, clique fora, rolagem ou redimensionamento.
 */
export function RowMenu({ items, label = 'Mais' }: { items: RowMenuItem[]; label?: string }) {
  const visible = items.filter((item) => !item.hidden);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = useCallback(() => { setOpen(false); setPos(null); }, []);

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const anchor = button.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8));
    const below = anchor.bottom + 6;
    const top = below + box.height > window.innerHeight - 8 ? Math.max(8, anchor.top - box.height - 6) : below;
    setPos({ top, left });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); button.current?.focus(); } };
    const onDown = (event: MouseEvent) => { const target = event.target as Node; if (!panel.current?.contains(target) && !button.current?.contains(target)) close(); };
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open, close]);

  if (!visible.length) return null;
  return <>
    <button ref={button} type="button" className="admin-button admin-button-small admin-button-ghost row-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{label} <span aria-hidden="true">▾</span></button>
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={panel} className="row-menu" role="menu" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
        {visible.map((item) => item.href
          ? <Link key={item.label} role="menuitem" href={item.href} className="row-menu-item" onClick={close}>{item.label}</Link>
          : <button key={item.label} type="button" role="menuitem" disabled={item.disabled} className={`row-menu-item ${item.danger ? 'is-danger' : ''}`} onClick={() => { close(); item.onClick?.(); }}>{item.label}{item.hint && <small>{item.hint}</small>}</button>)}
      </div>, document.body)}
  </>;
}
