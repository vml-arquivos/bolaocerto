import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../../components/site-header';
import { apiGet } from '../../lib/api';
import { absolute, BlogPostSummary, postDate } from '../../lib/blog';
import { BlogCard } from '../../components/blog-card';
import { siteUrl } from '../../lib/site-url';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteUrl();
  const title = 'Blog: dicas, regras e novidades sobre bolões';
  const description = 'Conteúdos do Bolão Livre sobre como funcionam os bolões, as modalidades da loteria, resultados e jogo responsável.';
  return { title, description, alternates: { canonical: `${origin}/blog` }, openGraph: { title, description, url: `${origin}/blog`, type: 'website', locale: 'pt_BR', siteName: 'Bolão Livre' } };
}

export default async function BlogPage() {
  const origin = await siteUrl();
  const { data, error } = await apiGet<BlogPostSummary[]>('/blog/posts');
  const posts = data ?? [];
  const [first, ...rest] = posts;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog do Bolão Livre', url: `${origin}/blog`, blogPost: posts.slice(0, 20).map((post) => ({ '@type': 'BlogPosting', headline: post.titulo, url: `${origin}/blog/${post.slug}`, datePublished: post.publicadoEm, image: absolute(post.imagem, origin) })) };
  return <><SiteHeader /><main id="main-content" className="blog-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    <section className="blog-hero"><div className="shell"><nav className="blog-crumbs" aria-label="Você está em"><Link href="/">Início</Link><span aria-hidden="true">/</span><span>Blog</span></nav><span className="overline">Blog do Bolão Livre</span><h1>Dicas, regras e novidades sobre bolões</h1><p>Entenda como funcionam as cotas, as modalidades e os resultados, com informação clara para você decidir no seu ritmo.</p></div></section>
    <section className="shell blog-body">
      {error && <p role="status" className="muted">O blog está temporariamente indisponível. Tente de novo em instantes.</p>}
      {!error && !posts.length && <div className="blog-empty"><strong>Em breve, novos conteúdos.</strong><span>Enquanto isso, veja os <Link href="/#boloes">bolões abertos</Link> e os <Link href="/resultados">últimos resultados</Link>.</span></div>}
      {first && <Link href={`/blog/${first.slug}`} className="blog-feature">
        {first.imagem ? <img src={first.imagem} alt={first.imagemAlt ?? ''} loading="eager" /> : <span className="blog-cover-fallback" aria-hidden="true">BL</span>}
        <div><span className="blog-meta">{first.categoria && <b>{first.categoria}</b>}{postDate(first.publicadoEm)}</span><h2>{first.titulo}</h2><p>{first.resumo}</p><span className="blog-read">Ler o artigo <span aria-hidden="true">→</span></span></div>
      </Link>}
      {rest.length > 0 && <div className="blog-grid">{rest.map((post) => <BlogCard key={post.id} post={post} />)}</div>}
    </section>
  </main><SiteFooter /></>;
}
