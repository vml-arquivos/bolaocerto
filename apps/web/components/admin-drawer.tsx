'use client';
import { useEffect, type ReactNode } from 'react';

/**
 * Ficha lateral: abre à direita sem tirar a lista do lugar. No computador a lista continua visível e clicável
 * (dá para abrir outra pessoa direto); no celular ocupa a tela inteira. Esc ou "Fechar" fecham.
 */
export function AdminDrawer({ title, subtitle, onClose, children, actions }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('has-admin-drawer');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('has-admin-drawer'); };
  }, [onClose]);
  return <>
    <div className="admin-drawer-backdrop" aria-hidden="true" onMouseDown={onClose} />
    <aside className="admin-drawer" role="dialog" aria-label={typeof title === 'string' ? title : 'Ficha'}>
      <header className="admin-drawer-head">
        <div className="admin-drawer-title"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <div className="admin-drawer-actions">{actions}<button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={onClose}>Fechar</button></div>
      </header>
      <div className="admin-drawer-body">{children}</div>
    </aside>
  </>;
}
