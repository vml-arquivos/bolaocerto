import type { MetadataRoute } from 'next';
import { apiGet } from '../lib/api';
import { BlogPostSummary } from '../lib/blog';
import { siteUrl } from '../lib/site-url';

export const dynamic = 'force-dynamic';

/** Mapa do site para o Google: páginas públicas e todos os posts publicados do blog. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteUrl();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${origin}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${origin}/resultados`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${origin}/estatisticas`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${origin}/boloes/comparar`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${origin}/instalar`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${origin}/jogo-responsavel`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${origin}/termos`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${origin}/privacidade`, changeFrequency: 'monthly', priority: 0.3 },
  ];
  const posts = (await apiGet<BlogPostSummary[]>('/blog/posts?limite=100')).data ?? [];
  return [...pages, ...posts.map((post) => ({ url: `${origin}/blog/${post.slug}`, lastModified: new Date(post.atualizadoEm), changeFrequency: 'monthly' as const, priority: 0.7 }))];
}
