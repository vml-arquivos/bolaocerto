'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, authFetch, chip, dateTime, Notify, Panel } from './admin-ui';
import { shrinkImage } from './admin-vitrine';
import { Markdown } from '../lib/markdown';

type Post = { id: string; slug: string; titulo: string; resumo: string; conteudo: string; imagem: string | null; imagemAlt: string | null; seoTitulo: string | null; seoDescricao: string | null; palavrasChave: string | null; categoria: string | null; status: 'rascunho' | 'publicado'; publicadoEm: string | null; atualizadoEm: string };
type Seo = { titulo: string; descricao: string; palavrasChave: string | null; imagem: string | null };
type Draft = { id?: string; titulo: string; slug: string; resumo: string; conteudo: string; imagem: string; imagemAlt: string; seoTitulo: string; seoDescricao: string; palavrasChave: string; categoria: string; status: 'rascunho' | 'publicado' };

const EMPTY: Draft = { titulo: '', slug: '', resumo: '', conteudo: '', imagem: '', imagemAlt: '', seoTitulo: '', seoDescricao: '', palavrasChave: '', categoria: '', status: 'rascunho' };
const slugify = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WEBP).');
  const blob = await shrinkImage(file);
  const form = new FormData(); form.append('arquivo', blob, 'blog.jpg');
  const response = await authFetch('/api/v1/admin/blog/imagem', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível enviar a imagem.');
  return payload.url as string;
}

/** Contador de caracteres com a faixa ideal para o Google. */
function Counter({ value, ideal, max }: { value: string; ideal: [number, number]; max: number }) {
  const n = value.length;
  const tone = n === 0 ? '' : n < ideal[0] ? 'is-short' : n > ideal[1] ? 'is-long' : 'is-ok';
  return <small className={`seo-counter ${tone}`}>{n}/{max} · ideal {ideal[0]}–{ideal[1]}</small>;
}

/** Como o resultado aparece no Google. */
function GooglePreview({ title, description, path }: { title: string; description: string; path: string }) {
  const host = typeof window === 'undefined' ? 'bolaolivre.com' : window.location.host;
  return <div className="seo-preview" aria-label="Prévia no Google"><small>{host}{path}</small><strong>{title || 'Título da página'}</strong><span>{description || 'A descrição aparece aqui. Escreva um resumo claro do conteúdo, com a palavra que as pessoas procuram.'}</span></div>;
}

/** Tela "Blog e SEO": escrever e publicar posts (texto e imagens) e configurar o SEO da página inicial. */
export function BlogAdminView({ notify }: { notify: Notify }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [seo, setSeo] = useState<Seo | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, site] = await Promise.all([api<Post[]>('/api/v1/admin/blog/posts'), api<Seo>('/api/v1/seo/site')]);
      setPosts(list); setSeo(site);
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar o blog.'); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const patch = (values: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...values } : current));
  function edit(post?: Post) {
    setPreview(false);
    setSlugTouched(Boolean(post));
    setDraft(post ? { id: post.id, titulo: post.titulo, slug: post.slug, resumo: post.resumo ?? '', conteudo: post.conteudo, imagem: post.imagem ?? '', imagemAlt: post.imagemAlt ?? '', seoTitulo: post.seoTitulo ?? '', seoDescricao: post.seoDescricao ?? '', palavrasChave: post.palavrasChave ?? '', categoria: post.categoria ?? '', status: post.status } : { ...EMPTY });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cover(file: File | undefined) {
    if (!file) return;
    setBusy('capa');
    try { patch({ imagem: await uploadImage(file) }); notify('success', 'Imagem de capa enviada.'); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao enviar.'); }
    finally { setBusy(''); }
  }

  async function inlineImage(file: File | undefined) {
    if (!file || !draft) return;
    setBusy('imagem');
    try {
      const url = await uploadImage(file);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const area = textRef.current;
      const at = area ? area.selectionStart : draft.conteudo.length;
      const snippet = `\n\n![${alt}](${url})\n\n`;
      patch({ conteudo: `${draft.conteudo.slice(0, at)}${snippet}${draft.conteudo.slice(at)}` });
      notify('success', 'Imagem colocada no texto. A legenda é o que está entre os colchetes.');
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao enviar.'); }
    finally { setBusy(''); }
  }

  function wrap(before: string, after = before, placeholder = 'texto') {
    const area = textRef.current; if (!area || !draft) return;
    const start = area.selectionStart; const end = area.selectionEnd;
    const selected = draft.conteudo.slice(start, end) || placeholder;
    patch({ conteudo: `${draft.conteudo.slice(0, start)}${before}${selected}${after}${draft.conteudo.slice(end)}` });
    window.setTimeout(() => { area.focus(); area.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
  }

  async function save(status: Draft['status']) {
    if (!draft) return;
    if (draft.titulo.trim().length < 3) { notify('error', 'Escreva um título com pelo menos 3 letras.'); return; }
    if (!draft.conteudo.trim()) { notify('error', 'Escreva o texto do post.'); return; }
    setBusy('salvar');
    try {
      const body = { ...draft, status, slug: draft.slug || slugify(draft.titulo) };
      delete (body as Partial<Draft>).id;
      const saved = await api<Post>(draft.id ? `/api/v1/admin/blog/posts/${draft.id}` : '/api/v1/admin/blog/posts', { method: draft.id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      notify('success', status === 'publicado' ? `Publicado em /blog/${saved.slug}.` : 'Rascunho salvo. Ele não aparece no site até ser publicado.');
      setDraft(null); await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  }

  async function remove(post: Post) {
    if (!window.confirm(`Excluir o post “${post.titulo}”? Ele sai do site e não pode ser recuperado.`)) return;
    setBusy(`del-${post.id}`);
    try { await api(`/api/v1/admin/blog/posts/${post.id}`, { method: 'DELETE' }); notify('success', 'Post excluído.'); await load(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível excluir.'); }
    finally { setBusy(''); }
  }

  async function saveSeo() {
    if (!seo) return;
    setBusy('seo');
    try { setSeo(await api<Seo>('/api/v1/admin/seo', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(seo) })); notify('success', 'SEO da página inicial salvo. O Google lê a mudança na próxima visita dele.'); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  }

  async function seoImage(file: File | undefined) {
    if (!file || !seo) return;
    setBusy('seo-img');
    try { setSeo({ ...seo, imagem: await uploadImage(file) }); notify('success', 'Imagem enviada. Toque em “Salvar SEO”.'); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Falha ao enviar.'); }
    finally { setBusy(''); }
  }

  if (loading) return <div className="admin-spinner" aria-label="Carregando" />;

  return <>
    <div className="admin-page-heading"><div><h1>Blog e SEO</h1><p className="admin-muted-note">Escreva conteúdos para o site e configure como o Bolão Livre aparece no Google.</p></div>{!draft && <div className="admin-heading-actions"><button className="admin-button admin-button-primary" onClick={() => edit()}>Novo post</button><a className="admin-button admin-button-secondary" href="/blog" target="_blank" rel="noreferrer">Ver o blog</a></div>}</div>

    {draft && <Panel title={draft.id ? 'Editar post' : 'Novo post'} action={<div className="admin-row-actions"><button className="admin-button admin-button-small admin-button-ghost" onClick={() => setDraft(null)} disabled={Boolean(busy)}>Fechar</button></div>}>
      <div className="blog-editor">
        <div className="blog-editor-main">
          <label className="admin-field"><span>Título do post</span><input value={draft.titulo} maxLength={140} placeholder="Ex.: Como funciona a cota de um bolão" onChange={(event) => patch({ titulo: event.target.value, ...(slugTouched ? {} : { slug: slugify(event.target.value) }) })} /></label>
          <label className="admin-field"><span>Endereço (fica bolaolivre.com/blog/…)</span><input value={draft.slug} maxLength={90} placeholder="como-funciona-a-cota" onChange={(event) => { setSlugTouched(true); patch({ slug: slugify(event.target.value) }); }} /></label>
          <label className="admin-field"><span>Resumo (aparece na lista e no compartilhamento)</span><textarea rows={2} value={draft.resumo} maxLength={320} placeholder="Se deixar vazio, usamos o começo do texto." onChange={(event) => patch({ resumo: event.target.value })} /></label>
          <div className="admin-field"><span>Texto</span>
            <div className="blog-toolbar" role="toolbar" aria-label="Formatação">
              <button type="button" onClick={() => wrap('\n## ', '\n', 'Subtítulo')}>Subtítulo</button>
              <button type="button" onClick={() => wrap('**')}>Negrito</button>
              <button type="button" onClick={() => wrap('*')}>Itálico</button>
              <button type="button" onClick={() => wrap('\n- ', '', 'item da lista')}>Lista</button>
              <button type="button" onClick={() => wrap('[', '](https://)', 'texto do link')}>Link</button>
              <button type="button" onClick={() => wrap('\n> ', '\n', 'destaque')}>Destaque</button>
              <label className="blog-toolbar-upload">{busy === 'imagem' ? 'Enviando…' : 'Imagem no texto'}<input type="file" accept="image/*" hidden onChange={(event) => { void inlineImage(event.target.files?.[0]); event.target.value = ''; }} /></label>
              <button type="button" className={preview ? 'is-on' : ''} onClick={() => setPreview((value) => !value)}>{preview ? 'Voltar a escrever' : 'Prévia'}</button>
            </div>
            {preview ? <div className="blog-editor-preview blog-article-body"><Markdown source={draft.conteudo || '_Nada escrito ainda._'} /></div> : <textarea ref={textRef} className="blog-editor-text" rows={16} value={draft.conteudo} onChange={(event) => patch({ conteudo: event.target.value })} placeholder={'Escreva o texto. Linha em branco separa parágrafos.\n\n## Subtítulo\nTexto com **negrito** e [link](https://bolaolivre.com).'} />}
          </div>
        </div>
        <aside className="blog-editor-side">
          <div className="blog-cover-box">
            <span>Imagem de capa</span>
            {draft.imagem ? <img src={draft.imagem} alt={draft.imagemAlt || 'Capa do post'} /> : <div className="blog-cover-empty">Sem imagem</div>}
            <div className="admin-row-actions"><label className="admin-button admin-button-small admin-button-secondary">{busy === 'capa' ? 'Enviando…' : draft.imagem ? 'Trocar imagem' : 'Enviar imagem'}<input type="file" accept="image/*" hidden onChange={(event) => { void cover(event.target.files?.[0]); event.target.value = ''; }} /></label>{draft.imagem && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => patch({ imagem: '' })}>Tirar</button>}</div>
            <label className="admin-field"><span>Descrição da imagem (Google e leitores de tela)</span><input value={draft.imagemAlt} maxLength={160} placeholder="Ex.: Volante da Mega-Sena preenchido" onChange={(event) => patch({ imagemAlt: event.target.value })} /></label>
          </div>
          <label className="admin-field"><span>Categoria</span><input value={draft.categoria} maxLength={60} placeholder="Ex.: Dicas, Mega-Sena, Novidades" onChange={(event) => patch({ categoria: event.target.value })} /></label>
          <div className="blog-seo-box">
            <strong>SEO do post</strong>
            <label className="admin-field"><span>Título para o Google</span><input value={draft.seoTitulo} maxLength={70} placeholder={draft.titulo || 'Igual ao título do post'} onChange={(event) => patch({ seoTitulo: event.target.value })} /><Counter value={draft.seoTitulo || draft.titulo} ideal={[30, 60]} max={70} /></label>
            <label className="admin-field"><span>Descrição para o Google</span><textarea rows={3} value={draft.seoDescricao} maxLength={170} placeholder={draft.resumo || 'Igual ao resumo'} onChange={(event) => patch({ seoDescricao: event.target.value })} /><Counter value={draft.seoDescricao || draft.resumo} ideal={[110, 160]} max={170} /></label>
            <label className="admin-field"><span>Palavras-chave (separadas por vírgula)</span><input value={draft.palavrasChave} maxLength={200} placeholder="bolão mega-sena, como funciona bolão" onChange={(event) => patch({ palavrasChave: event.target.value })} /></label>
            <GooglePreview title={draft.seoTitulo || draft.titulo} description={draft.seoDescricao || draft.resumo} path={`/blog/${draft.slug || slugify(draft.titulo)}`} />
          </div>
        </aside>
      </div>
      <div className="blog-editor-actions">
        <button className="admin-button" disabled={Boolean(busy)} onClick={() => void save('rascunho')}>{busy === 'salvar' ? 'Salvando…' : 'Salvar rascunho'}</button>
        <button className="admin-button admin-button-primary" disabled={Boolean(busy)} onClick={() => void save('publicado')}>{busy === 'salvar' ? 'Salvando…' : draft.status === 'publicado' ? 'Salvar e manter publicado' : 'Publicar no site'}</button>
        {draft.id && draft.status === 'publicado' && <button className="admin-button admin-button-ghost" disabled={Boolean(busy)} onClick={() => void save('rascunho')}>Tirar do ar (vira rascunho)</button>}
      </div>
    </Panel>}

    {!draft && <Panel title={`Posts · ${posts.length}`} description="Publicados aparecem em /blog, na página inicial (os 3 mais recentes) e no mapa do site para o Google.">
      {!posts.length ? <div className="blog-empty"><strong>Nenhum post ainda.</strong><span>Toque em “Novo post” para escrever o primeiro.</span></div> : <div className="blog-admin-list">{posts.map((post) => <article key={post.id} className="blog-admin-item">
        {post.imagem ? <img src={post.imagem} alt="" /> : <span className="blog-cover-fallback" aria-hidden="true">BL</span>}
        <div><strong>{post.titulo}</strong><small>/blog/{post.slug} · {post.status === 'publicado' ? `publicado ${dateTime(post.publicadoEm)}` : `editado ${dateTime(post.atualizadoEm)}`}</small><span className={chip(post.status === 'publicado' ? 'liberado' : 'rascunho')}>{post.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span></div>
        <div className="admin-row-actions"><button className="admin-button admin-button-small admin-button-secondary" onClick={() => edit(post)}>Editar</button>{post.status === 'publicado' && <a className="admin-button admin-button-small" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">Ver</a>}<button className="admin-button admin-button-small admin-button-ghost admin-danger" disabled={busy === `del-${post.id}`} onClick={() => void remove(post)}>Excluir</button></div>
      </article>)}</div>}
    </Panel>}

    {!draft && seo && <Panel title="SEO da página inicial" description="Como o Bolão Livre aparece no Google e ao compartilhar o link no WhatsApp e redes sociais.">
      <div className="blog-editor">
        <div className="blog-editor-main">
          <label className="admin-field"><span>Título</span><input value={seo.titulo} maxLength={70} onChange={(event) => setSeo({ ...seo, titulo: event.target.value })} /><Counter value={seo.titulo} ideal={[30, 60]} max={70} /></label>
          <label className="admin-field"><span>Descrição</span><textarea rows={3} value={seo.descricao} maxLength={170} onChange={(event) => setSeo({ ...seo, descricao: event.target.value })} /><Counter value={seo.descricao} ideal={[110, 160]} max={170} /></label>
          <label className="admin-field"><span>Palavras-chave (separadas por vírgula)</span><input value={seo.palavrasChave ?? ''} maxLength={250} onChange={(event) => setSeo({ ...seo, palavrasChave: event.target.value })} /></label>
          <GooglePreview title={seo.titulo} description={seo.descricao} path="/" />
        </div>
        <aside className="blog-editor-side">
          <div className="blog-cover-box">
            <span>Imagem ao compartilhar o link (1200×630 fica melhor)</span>
            {seo.imagem ? <img src={seo.imagem} alt="Imagem de compartilhamento" /> : <div className="blog-cover-empty">Usa o ícone do Bolão Livre</div>}
            <div className="admin-row-actions"><label className="admin-button admin-button-small admin-button-secondary">{busy === 'seo-img' ? 'Enviando…' : seo.imagem ? 'Trocar imagem' : 'Enviar imagem'}<input type="file" accept="image/*" hidden onChange={(event) => { void seoImage(event.target.files?.[0]); event.target.value = ''; }} /></label>{seo.imagem && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setSeo({ ...seo, imagem: null })}>Tirar</button>}</div>
          </div>
        </aside>
      </div>
      <div className="blog-editor-actions"><button className="admin-button admin-button-primary" disabled={Boolean(busy) || seo.titulo.trim().length < 10 || seo.descricao.trim().length < 50} onClick={() => void saveSeo()}>{busy === 'seo' ? 'Salvando…' : 'Salvar SEO'}</button><span className="admin-muted-note">O mapa do site (/sitemap.xml) e o robots.txt são gerados sozinhos, já com os posts publicados.</span></div>
    </Panel>}
  </>;
}
