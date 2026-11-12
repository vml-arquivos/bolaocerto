import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
import { apiGet } from '../../../lib/api';
import { absolute, BlogPost, BlogPostSummary, postDate } from '../../../lib/blog';
import { Markdown, readingMinutes } from '../../../lib/markdown';
import { siteUrl } from '../../../lib/site-url';
import { BlogCard } from '../../../components/blog-card';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  return (await apiGet<BlogPost>(`/blog/posts/${slug}`)).data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await load(slug);
  if (!post) return { title: 'Post não encontrado', robots: { index: false } };
  const origin = await siteUrl();
  const title = post.seoTitulo || post.titulo;
  const description = post.seoDescricao || post.resumo;
  const image = absolute(post.imagem, origin);
  return {
    title, description, keywords: post.palavrasChave ?? undefined,
    alternates: { canonical: `${origin}/blog/${post.slug}` },
    openGraph: { title, description, url: `${origin}/blog/${post.slug}`, type: 'article', locale: 'pt_BR', siteName: 'Bolão Livre', publishedTime: post.publicadoEm ?? undefined, modifiedTime: post.atualizadoEm, images: image ? [{ url: image, alt: post.imagemAlt ?? post.titulo }] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : undefined },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await load(slug);
  if (!post) notFound();
  const origin = await siteUrl();
  const others = ((await apiGet<BlogPostSummary[]>('/blog/posts?limite=4')).data ?? []).filter((item) => item.id !== post.id).slice(0, 3);
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.titulo, description: post.seoDescricao || post.resumo, image: absolute(post.imagem, origin), datePublished: post.publicadoEm, dateModified: post.atualizadoEm, author: { '@type': 'Organization', name: post.autor || 'Bolão Livre' }, publisher: { '@type': 'Organization', name: 'Bolão Livre', logo: { '@type': 'ImageObject', url: `${origin}/brand/bl-app-icon.png` } }, mainEntityOfPage: `${origin}/blog/${post.slug}`, keywords: post.palavrasChave ?? undefined },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: origin }, { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/blog` }, { '@type': 'ListItem', position: 3, name: post.titulo, item: `${origin}/blog/${post.slug}` }] },
  ];
  return <><SiteHeader /><main id="main-content" className="blog-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    <article className="blog-article">
      <header className="shell blog-article-head">
        <nav className="blog-crumbs" aria-label="Você está em"><Link href="/">Início</Link><span aria-hidden="true">/</span><Link href="/blog">Blog</Link></nav>
        {post.categoria && <span className="overline">{post.categoria}</span>}
        <h1>{post.titulo}</h1>
        {post.resumo && <p className="blog-lead">{post.resumo}</p>}
        <span className="blog-meta">{post.autor && <b>{post.autor}</b>}<time dateTime={post.publicadoEm ?? undefined}>{postDate(post.publicadoEm)}</time> · {readingMinutes(post.conteudo)} min de leitura</span>
      </header>
      {post.imagem && <figure className="shell blog-article-cover"><img src={post.imagem} alt={post.imagemAlt ?? ''} /></figure>}
      <div className="shell blog-article-body"><Markdown source={post.conteudo} /></div>
      <aside className="shell blog-cta"><div><strong>Pronto para participar?</strong><span>Veja os bolões com cotas abertas e acompanhe tudo pela sua conta.</span></div><Link className="button button-primary" href="/#boloes">Ver bolões abertos</Link></aside>
    </article>
    {others.length > 0 && <section className="shell blog-more"><h2>Continue lendo</h2><div className="blog-grid">{others.map((item) => <BlogCard key={item.id} post={item} />)}</div></section>}
  </main><SiteFooter /></>;
}
