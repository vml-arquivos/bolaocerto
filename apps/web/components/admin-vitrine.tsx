'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, modalityNames, Notify, Panel, Rec } from './admin-ui';

type Slide = { id: string; tipo: 'bolao' | 'livre'; ativo: boolean; bolaoId?: string; modalidade?: string; titulo: string; subtitulo?: string; botao?: string; link?: string };
type Secoes = { numeros: boolean; modalidades: boolean; resultados: boolean; sorteados: boolean; encerrados: boolean; concursos: boolean; comoFunciona: boolean; duvidas: boolean };
type PoolOption = { id: string; modalidade: string; grupo: string | null; concurso: string | number | null; valorCota: string | number; cotasDisponiveis: number };

const MAX_SLIDES = 8;
const MAX_DESTAQUES = 6;
const SECTION_LABELS: Array<[keyof Secoes, string, string]> = [
  ['modalidades', 'Próximos sorteios', 'Faixa com a contagem regressiva de cada jogo.'],
  ['resultados', 'Últimos resultados', 'Números sorteados de cada jogo, com abas por modalidade.'],
  ['sorteados', 'Bolões já sorteados', 'Seus bolões com o resultado e os acertos.'],
  ['encerrados', 'Vendas encerradas', 'Bolões que não vendem mais e aguardam o sorteio.'],
  ['concursos', 'Calendário de concursos', 'Lista dos próximos concursos com prêmio e data.'],
  ['numeros', 'Faixa de números', 'Resumo: concursos abertos, bolões com cotas.'],
  ['comoFunciona', 'Como funciona', 'Os quatro passos, do concurso ao comprovante.'],
  ['duvidas', 'Perguntas frequentes', 'Respostas rápidas sobre cota, comprovante e prêmio.'],
];

let counter = 0;
const newId = () => `s${Date.now().toString(36)}${(counter += 1)}`;
const poolLabel = (pool: PoolOption) => `${pool.grupo ?? 'Bolão'} · ${modalityNames[pool.modalidade] ?? pool.modalidade} · ${Number(pool.concurso) > 0 ? `concurso ${pool.concurso}` : 'concurso a definir'} · ${pool.cotasDisponiveis} cotas`;

/** Tela "Página inicial": o administrador escolhe o carrossel, os bolões em destaque e as seções visíveis. */
export function VitrineView({ notify }: { notify: Notify }) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [slides, setSlides] = useState<Slide[]>([]);
  const [featured, setFeatured] = useState<string[]>([]);
  const [sections, setSections] = useState<Secoes | null>(null);
  const [pools, setPools] = useState<PoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Rec>('/api/v1/admin/home');
      setSlides(data.config?.slides ?? []); setFeatured(data.config?.destaques ?? []); setSections(data.config?.secoes ?? null); setPools(data.boloes ?? []); setDirty(false);
    } catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível carregar a página inicial.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const touch = () => setDirty(true);
  const patchSlide = (id: string, patch: Partial<Slide>) => { setSlides((list) => list.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide))); touch(); };
  const moveSlide = (index: number, delta: number) => { setSlides((list) => { const next = [...list]; const target = index + delta; if (target < 0 || target >= next.length) return list; const a = next[index]; const b = next[target]; if (!a || !b) return list; next[index] = b; next[target] = a; return next; }); touch(); };
  const removeSlide = (id: string) => { setSlides((list) => list.filter((slide) => slide.id !== id)); touch(); };
  const addSlide = (tipo: Slide['tipo']) => { setSlides((list) => (list.length >= MAX_SLIDES ? list : [...list, { id: newId(), tipo, ativo: true, titulo: '', ...(tipo === 'livre' ? { modalidade: 'megasena' } : {}) }])); touch(); };
  const moveFeatured = (index: number, delta: number) => { setFeatured((list) => { const next = [...list]; const target = index + delta; if (target < 0 || target >= next.length) return list; const a = next[index]; const b = next[target]; if (a === undefined || b === undefined) return list; next[index] = b; next[target] = a; return next; }); touch(); };
  const toggleFeatured = (id: string) => { setFeatured((list) => (list.includes(id) ? list.filter((item) => item !== id) : list.length >= MAX_DESTAQUES ? list : [...list, id])); touch(); };

  async function save() {
    if (!sections) return;
    const clean = slides.map((slide) => ({
      id: slide.id, tipo: slide.tipo, ativo: slide.ativo,
      ...(slide.tipo === 'bolao' ? { bolaoId: slide.bolaoId } : { modalidade: slide.modalidade }),
      titulo: (slide.titulo ?? '').trim(),
      ...(slide.subtitulo?.trim() ? { subtitulo: slide.subtitulo.trim() } : {}),
      ...(slide.botao?.trim() ? { botao: slide.botao.trim() } : {}),
      ...(slide.link?.trim() ? { link: slide.link.trim() } : {}),
    }));
    setBusy(true);
    try {
      await api('/api/v1/admin/home', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slides: clean, destaques: featured, secoes: sections }) });
      notify('success', 'Página inicial atualizada. Quem abrir o site já vê a nova versão.');
      await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  const poolById = new Map(pools.map((pool) => [pool.id, pool]));
  return <>
    <div className="admin-page-heading"><div><span className="admin-eyebrow">Jogos e vendas</span><h1>Página inicial</h1><p>Monte a vitrine do site: o carrossel do topo, os bolões que você quer vender mais e o que aparece na página.</p></div><div className="admin-heading-actions"><Link className="admin-button admin-button-ghost" href="/" target="_blank" rel="noopener noreferrer">Ver o site</Link><button type="button" className="admin-button admin-button-primary" onClick={() => void save()} disabled={busy || loading || !dirty}>{busy ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Tudo salvo'}</button></div></div>
    {loading ? <p role="status">Carregando…</p> : <>
      <Panel title="Carrossel do topo" description={`Até ${MAX_SLIDES} destaques passando em sequência. Sem nenhum, o site mostra sozinho os concursos de maior prêmio.`} action={<div className="vitrine-add"><button type="button" className="admin-button admin-button-ghost admin-button-small" disabled={slides.length >= MAX_SLIDES} onClick={() => addSlide('bolao')}>+ Bolão</button><button type="button" className="admin-button admin-button-ghost admin-button-small" disabled={slides.length >= MAX_SLIDES} onClick={() => addSlide('livre')}>+ Mensagem livre</button></div>}>
        {slides.length === 0 ? <div className="admin-callout" role="status">Nenhum destaque criado. Toque em “+ Bolão” e escolha, por exemplo, o bolão da Mega da Virada.</div> : <ol className="vitrine-list">{slides.map((slide, index) => {
          const pool = slide.bolaoId ? poolById.get(slide.bolaoId) : undefined;
          return <li key={slide.id} className={`vitrine-item ${slide.ativo ? '' : 'is-off'}`}>
            <div className="vitrine-item-head"><strong>{index + 1}. {slide.tipo === 'bolao' ? 'Bolão' : 'Mensagem livre'}</strong>
              <label className="vitrine-check"><input type="checkbox" checked={slide.ativo} onChange={(event) => patchSlide(slide.id, { ativo: event.target.checked })} /> Mostrar</label>
              <span className="vitrine-order"><button type="button" aria-label="Subir" disabled={index === 0} onClick={() => moveSlide(index, -1)}>↑</button><button type="button" aria-label="Descer" disabled={index === slides.length - 1} onClick={() => moveSlide(index, 1)}>↓</button><button type="button" aria-label="Remover destaque" onClick={() => removeSlide(slide.id)}>✕</button></span></div>
            <div className="admin-form-grid">
              {slide.tipo === 'bolao' ? <label className="admin-field admin-field-wide"><span>Bolão</span><select value={slide.bolaoId ?? ''} onChange={(event) => patchSlide(slide.id, { bolaoId: event.target.value })}><option value="">Escolha um bolão aberto…</option>{pools.map((option) => <option key={option.id} value={option.id}>{poolLabel(option)}</option>)}{slide.bolaoId && !pool && <option value={slide.bolaoId}>Bolão que já não está aberto</option>}</select>{slide.bolaoId && !pool && <small>Este bolão não está mais com cotas abertas e some do carrossel até voltar a vender.</small>}</label>
                : <label className="admin-field"><span>Jogo (define a imagem)</span><select value={slide.modalidade ?? 'megasena'} onChange={(event) => patchSlide(slide.id, { modalidade: event.target.value })}>{Object.entries(modalityNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
              <label className="admin-field"><span>Título{slide.tipo === 'bolao' ? ' (opcional)' : ''}</span><input maxLength={80} value={slide.titulo} onChange={(event) => patchSlide(slide.id, { titulo: event.target.value })} placeholder={slide.tipo === 'bolao' ? 'Em branco: usa o nome do jogo' : 'Ex.: Mega da Virada 2026'} /></label>
              <label className="admin-field"><span>Subtítulo (opcional)</span><input maxLength={200} value={slide.subtitulo ?? ''} onChange={(event) => patchSlide(slide.id, { subtitulo: event.target.value })} placeholder="Ex.: Cotas abertas até 31/12" /></label>
              <label className="admin-field"><span>Texto do botão</span><input maxLength={30} value={slide.botao ?? ''} onChange={(event) => patchSlide(slide.id, { botao: event.target.value })} placeholder={slide.tipo === 'bolao' ? 'Ver bolão' : 'Ex.: Participar'} /></label>
              {slide.tipo === 'livre' && <label className="admin-field"><span>Link do botão</span><input maxLength={200} value={slide.link ?? ''} onChange={(event) => patchSlide(slide.id, { link: event.target.value })} placeholder="/#boloes ou https://…" /></label>}
            </div>
          </li>;
        })}</ol>}
      </Panel>

      <Panel title="Bolões em destaque" description={`Aparecem logo abaixo do carrossel, em cartões. Escolha até ${MAX_DESTAQUES} entre os bolões com cotas abertas.`}>
        {featured.length > 0 && <ol className="vitrine-list vitrine-list-compact">{featured.map((id, index) => { const pool = poolById.get(id); return <li key={id} className="vitrine-item"><div className="vitrine-item-head"><strong>{index + 1}. {pool ? poolLabel(pool) : 'Bolão que já não está aberto'}</strong><span className="vitrine-order"><button type="button" aria-label="Subir" disabled={index === 0} onClick={() => moveFeatured(index, -1)}>↑</button><button type="button" aria-label="Descer" disabled={index === featured.length - 1} onClick={() => moveFeatured(index, 1)}>↓</button><button type="button" aria-label="Tirar do destaque" onClick={() => toggleFeatured(id)}>✕</button></span></div></li>; })}</ol>}
        {pools.length === 0 ? <div className="admin-callout">Nenhum bolão com cotas abertas agora.</div> : <div className="vitrine-pick">{pools.filter((pool) => !featured.includes(pool.id)).map((pool) => <button type="button" key={pool.id} className="admin-button admin-button-ghost admin-button-small" disabled={featured.length >= MAX_DESTAQUES} onClick={() => toggleFeatured(pool.id)}>+ {poolLabel(pool)}</button>)}</div>}
      </Panel>

      <Panel title="O que aparece na página" description="Desligue o que não quer mostrar. Seção sem conteúdo some sozinha.">
        {sections && <div className="vitrine-sections">{SECTION_LABELS.map(([key, name, hint]) => <label key={key} className="admin-toggle-row"><input type="checkbox" checked={sections[key]} onChange={(event) => { setSections({ ...sections, [key]: event.target.checked }); touch(); }} /><span><strong>{name}</strong><small>{hint}</small></span></label>)}</div>}
      </Panel>
      <div className="wizard-actions"><button type="button" className="admin-button admin-button-primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Tudo salvo'}</button></div>
    </>}
  </>;
}
