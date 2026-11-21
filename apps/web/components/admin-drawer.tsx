'use client';
import { useEffect, type ReactNode } from 'react';

/**
 * Ficha por cima da tela, sem apertar a lista de trás.
 * - "page": ficha completa (cliente, afiliado), larga no computador.
 * - padrão: painel lateral mais estreito (contrato, conta e acessos).
 * No celular (e no app instalado) ocupa a tela inteira, respeitando a área do entalhe.
 * Esc, "Voltar" ou um toque fora fecham.
 */
export function AdminDrawer({ title, subtitle, onClose, children, actions, size = 'side' }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; size?: 'side' | 'page' }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('has-admin-drawer');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('has-admin-drawer'); };
  }, [onClose]);
  return <>
    <div className="admin-drawer-backdrop" aria-hidden="true" onMouseDown={onClose} />
    <aside className={`admin-drawer${size === 'page' ? ' is-page' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Ficha'}>
      <header className="admin-drawer-head">
        <button type="button" className="admin-drawer-back" onClick={onClose} aria-label="Voltar">‹ <span>Voltar</span></button>
        <div className="admin-drawer-title"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {actions && <div className="admin-drawer-actions">{actions}</div>}
      </header>
      <div className="admin-drawer-body">{children}</div>
    </aside>
  </>;
}
