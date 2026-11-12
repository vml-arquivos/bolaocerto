import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';

export const dynamic = 'force-dynamic';

/** O que o Google pode visitar: o site público e o blog. Painel, área do afiliado, conta e API ficam de fora. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteUrl();
  return {
    rules: [{ userAgent: '*', allow: ['/', '/api/v1/blog/imagem/', '/api/v1/home/imagem/'], disallow: ['/admin', '/afiliado', '/minha-conta', '/checkout', '/api/', '/redefinir-senha', '/esqueci-senha', '/r/'] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
