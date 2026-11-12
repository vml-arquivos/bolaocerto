import { headers } from 'next/headers';
import { publicOrigin } from './public-origin';

/** Endereço público do site (para SEO: canônico, sitemap, Open Graph). SITE_URL vem do WEB_ORIGIN; sem ele, o endereço da própria requisição. */
export async function siteUrl(): Promise<string> {
  const configured = (process.env.SITE_URL ?? '').split(',')[0]!.trim();
  try { if (configured) return new URL(configured).origin; } catch { /* configuração inválida */ }
  try {
    const h = await headers();
    return publicOrigin({ host: h.get('host'), forwardedHost: h.get('x-forwarded-host'), forwardedProto: h.get('x-forwarded-proto'), requestUrl: 'http://localhost:3000', production: process.env.NODE_ENV === 'production' });
  } catch { return 'https://bolaolivre.com'; }
}
