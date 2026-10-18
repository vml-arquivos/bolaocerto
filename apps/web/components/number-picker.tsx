'use client';
import { pad } from '../lib/stats';

/** Volante clicável: o usuário marca/desmarca números de `min` a `max`. */
export function NumberPicker({ min, max, selected, onToggle, limit, label }: { min: number; max: number; selected: number[]; onToggle: (value: number) => void; limit?: number; label?: string }) {
  const values: number[] = [];
  for (let v = min; v <= max; v += 1) values.push(v);
  const full = limit !== undefined && selected.length >= limit;
  return <div className="st-picker" role="group" aria-label={label ?? 'Escolha os números'} style={{ ['--cols' as string]: max - min + 1 <= 31 ? 5 : 10 }}>
    {values.map((value) => {
      const on = selected.includes(value);
      return <button key={value} type="button" className={`st-pick${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => onToggle(value)}>{pad(value)}</button>;
    })}
  </div>;
}
