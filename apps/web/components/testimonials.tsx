'use client';
import { useCallback, useEffect, useState } from 'react';

export type PublicTestimonial = { id: string; nome: string; texto: string; estrelas: number; alvo: 'sistema' | 'afiliado'; afiliadoNome: string | null; criadoEm: string };
type MineItem = PublicTestimonial & { status: 'pendente' | 'aprovado' | 'oculto'; afiliadoId: string | null };
type Target = { tipo: 'sistema' | 'afiliado'; afiliadoId: string | null; nome: string };

const STATUS: Record<string, string> = { pendente: 'Publicado no site', aprovado: 'Publicado no site', oculto: 'Ocultado pela equipe' };

/** Estrelas só para mostrar (com texto para leitor de tela). */
export function Stars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const rounded = Math.round(value);
  return <span className={`stars stars-${size}`} role="img" aria-label={`${value.toLocaleString('pt-BR')} de 5 estrelas`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} aria-hidden="true" className={n <= rounded ? 'on' : ''}>★</span>)}</span>;
}

/** Escolher de 1 a 5 estrelas (botões grandes para o dedo, funciona no teclado). */
export function StarPicker({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <div className="star-picker" role="radiogroup" aria-label="Quantas estrelas">
    {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`} className={n <= value ? 'on' : ''} disabled={disabled} onClick={() => onChange(n)}>★</button>)}
  </div>;
}

export function TestimonialCard({ item }: { item: PublicTestimonial }) {
  return <article className="testimonial-card">
    <Stars value={item.estrelas} />
    <p>“{item.texto}”</p>
    <footer><strong>{item.nome}</strong><small>{item.alvo === 'afiliado' && item.afiliadoNome ? `sobre ${item.afiliadoNome.split(' ')[0]}` : 'sobre o Bolão Livre'}</small></footer>
  </article>;
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível concluir.');
  return data;
}

/** Cotista: escrever o depoimento sobre o Bolão Livre ou sobre o afiliado que vendeu, com estrelas. */
export function TestimonialForm() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [items, setItems] = useState<MineItem[]>([]);
  const [target, setTarget] = useState('sistema');
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [estrelas, setEstrelas] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const data = await call('/api/v1/depoimentos/meus');
    setTargets(data.destinos ?? []); setItems(data.itens ?? []);
    setNome((current) => current || data.nomeSugerido || '');
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  // Ao trocar o destino, traz o que a pessoa já escreveu para ele.
  useEffect(() => {
    const found = items.find((item) => (item.afiliadoId ?? 'sistema') === target);
    setTexto(found?.texto ?? ''); setEstrelas(found?.estrelas ?? 0);
  }, [target, items]);
  async function save() {
    setBusy(true); setMessage(null);
    try {
      await call('/api/v1/depoimentos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: nome.trim(), texto: texto.trim(), estrelas, afiliadoId: target === 'sistema' ? null : target }) });
      await load();
      setMessage({ ok: true, text: 'Obrigado! Seu depoimento já aparece na página principal do site e do app.' });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível enviar.' }); }
    finally { setBusy(false); }
  }
  const current = items.find((item) => (item.afiliadoId ?? 'sistema') === target);
  return <div className="testimonial-form">
    <p className="muted">Conte como foi sua experiência. Seu depoimento aparece na hora na página principal do site e do app, com o nome que você escolher e as estrelas.</p>
    {targets.length > 1 && <label>Sobre quem é o depoimento<select value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>{targets.map((item) => <option key={item.afiliadoId ?? 'sistema'} value={item.afiliadoId ?? 'sistema'}>{item.tipo === 'sistema' ? 'O Bolão Livre' : `Afiliado: ${item.nome}`}</option>)}</select></label>}
    <div className="testimonial-stars-field"><span>Sua nota</span><StarPicker value={estrelas} onChange={setEstrelas} disabled={busy} /></div>
    <label>Seu depoimento<textarea value={texto} maxLength={800} rows={4} disabled={busy} placeholder="Como foi participar do bolão, receber o comprovante, acompanhar o resultado…" onChange={(event) => setTexto(event.target.value)} /><small>{texto.trim().length}/800</small></label>
    <label>Nome que aparece no site<input value={nome} maxLength={60} disabled={busy} onChange={(event) => setNome(event.target.value)} /></label>
    {current && <small className="testimonial-status">Situação: {STATUS[current.status]}{current.status === 'oculto' ? ' (fale com a equipe se quiser republicar)' : ''}</small>}
    {message && <p className={`form-message ${message.ok ? 'form-success' : 'form-error'}`} role="status">{message.text}</p>}
    <button type="button" className="button button-primary" disabled={busy || estrelas < 1 || texto.trim().length < 10} onClick={() => void save()}>{busy ? 'Enviando…' : current ? 'Atualizar depoimento' : 'Enviar depoimento'}</button>
  </div>;
}

/** Afiliado: o que os clientes disseram dele. */
export function AffiliateTestimonials() {
  const [data, setData] = useState<{ media: number; total: number; aguardando: number; items: PublicTestimonial[] } | null>(null);
  useEffect(() => { void call('/api/v1/afiliados/me/depoimentos').then(setData).catch(() => setData({ media: 0, total: 0, aguardando: 0, items: [] })); }, []);
  if (!data) return <p className="muted">Carregando depoimentos…</p>;
  return <div className="testimonial-affiliate">
    <div className="testimonial-summary">{data.total ? <><Stars value={data.media} /><strong>{data.media.toLocaleString('pt-BR')}</strong><span>{data.total} {data.total === 1 ? 'depoimento' : 'depoimentos'} publicados</span></> : <span>Nenhum depoimento publicado ainda.</span>}{data.aguardando > 0 && <small>{data.aguardando} aguardando aprovação da equipe</small>}</div>
    {data.items.length > 0 && <div className="testimonial-grid">{data.items.map((item) => <TestimonialCard key={item.id} item={item} />)}</div>}
    <p className="muted">Peça para os seus clientes escreverem em Minha conta → Meu depoimento. Eles podem avaliar você e o Bolão Livre.</p>
  </div>;
}
