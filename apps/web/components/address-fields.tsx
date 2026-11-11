'use client';
import { useState } from 'react';
import { fillAddressFromCep } from '../lib/cep';

export type AddressValues = { cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null };

const FIELDS: Array<{ name: keyof AddressValues; label: string; max?: number; optional?: boolean }> = [
  { name: 'cep', label: 'CEP', max: 9 },
  { name: 'logradouro', label: 'Rua / logradouro', max: 120 },
  { name: 'numero', label: 'Número', max: 20 },
  { name: 'complemento', label: 'Complemento', max: 80, optional: true },
  { name: 'bairro', label: 'Bairro', max: 80 },
  { name: 'cidade', label: 'Cidade', max: 80 },
  { name: 'uf', label: 'UF', max: 2 },
];

export const ADDRESS_KEYS = FIELDS.map((field) => field.name);

/** Lê o endereço de um formulário (só os campos preenchidos). */
export function readAddress(form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  return Object.fromEntries(ADDRESS_KEYS.map((key) => [key, String(data.get(key) ?? '').trim()]).filter(([, value]) => value));
}

/** Campos de endereço com busca pelo CEP: digitou os 8 números, rua, bairro, cidade e UF aparecem sozinhos. */
export function AddressFields({ defaults, idPrefix, variant = 'site' }: { defaults?: AddressValues; idPrefix: string; variant?: 'site' | 'admin' }) {
  const [status, setStatus] = useState('');
  async function onCep(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (input.value.replace(/\D/g, '').length !== 8) { setStatus(''); return; }
    setStatus('Buscando o endereço pelo CEP…');
    setStatus(await fillAddressFromCep(input));
  }
  return <>
    {FIELDS.map((field) => {
      const id = `${idPrefix}-${field.name}`;
      const input = <input id={id} name={field.name} maxLength={field.max} required={!field.optional} defaultValue={defaults?.[field.name] ?? ''}
        {...(field.name === 'cep' ? { inputMode: 'numeric' as const, autoComplete: 'postal-code', onChange: (event: React.ChangeEvent<HTMLInputElement>) => void onCep(event) } : {})}
        {...(field.name === 'uf' ? { style: { textTransform: 'uppercase' as const } } : {})} />;
      return variant === 'admin'
        ? <label key={field.name} className="admin-field" htmlFor={id}><span>{field.label}</span>{input}{field.name === 'cep' && status && <small role="status">{status}</small>}</label>
        : <div key={field.name} className="field"><label htmlFor={id}>{field.label}</label>{input}{field.name === 'cep' && status && <small className="muted" role="status">{status}</small>}</div>;
    })}
  </>;
}
