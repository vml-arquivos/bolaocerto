import Link from 'next/link';
import { BlogPostSummary, postDate } from '../lib/blog';

/** Cartão de post do blog (lista do blog, página inicial e "continue lendo"). */
export function BlogCard({ post }: { post: BlogPostSummary }) {
  return <Link href={`/blog/${post.slug}`} className="blog-card">
    {post.imagem ? <img src={post.imagem} alt={post.imagemAlt ?? ''} loading="lazy" decoding="async" /> : <span className="blog-cover-fallback" aria-hidden="true">BL</span>}
    <div><span className="blog-meta">{post.categoria && <b>{post.categoria}</b>}{postDate(post.publicadoEm)}</span><h3>{post.titulo}</h3><p>{post.resumo}</p></div>
  </Link>;
}
