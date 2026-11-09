'use client';
import { useState } from 'react';
import { PASSWORD_HINT, PASSWORD_MAX, PASSWORD_MIN } from '../lib/password';

/** Campo de senha com botão "Mostrar". Use `create` para criar/trocar senha (mostra a regra). */
export function PasswordField({ id, name, label, create = false, autoComplete, hint = true, children }: { id: string; name: string; label: string; create?: boolean; autoComplete?: string; hint?: boolean; children?: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  return <div className="field password-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-input">
      <input id={id} name={name} type={shown ? 'text' : 'password'} required autoComplete={autoComplete ?? (create ? 'new-password' : 'current-password')} minLength={create ? PASSWORD_MIN : undefined} maxLength={create ? PASSWORD_MAX : undefined} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby={create ? `${id}-hint` : undefined} />
      <button type="button" className="password-toggle" onClick={() => setShown(value => !value)} aria-pressed={shown} aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'}>{shown ? 'Ocultar' : 'Mostrar'}</button>
    </div>
    {create && hint && <small id={`${id}-hint`} className="field-hint">{PASSWORD_HINT}</small>}
    {children}
  </div>;
}
