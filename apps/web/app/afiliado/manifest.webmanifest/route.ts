// Manifesto do aplicativo do AFILIADO. É um terceiro aplicativo: o do cliente (/manifest.webmanifest) e o do painel
// da equipe (/admin/manifest.webmanifest) têm outro id, escopo, nome e ícone. Os três podem ficar no mesmo aparelho.
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    id: '/afiliado',
    name: 'BL Afiliado — Vendas e comissões',
    short_name: 'BL Afiliado',
    description: 'Seu painel de afiliado no Bolão Livre: cotas, vendas, bolões, grupos e comissões.',
    start_url: '/afiliado?origem=pwa',
    scope: '/afiliado',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#1b1204',
    theme_color: '#1b1204',
    lang: 'pt-BR',
    categories: ['business', 'finance'],
    prefer_related_applications: false,
    shortcuts: [
      { name: 'Minhas cotas', short_name: 'Cotas', url: '/afiliado?aba=cotas' },
      { name: 'Minhas vendas', short_name: 'Vendas', url: '/afiliado?aba=vendas' },
      { name: 'Meus bolões', short_name: 'Bolões', url: '/afiliado?aba=boloes' },
      { name: 'Comissões', short_name: 'Comissões', url: '/afiliado?aba=comissoes' },
      { name: 'Meus grupos', short_name: 'Grupos', url: '/afiliado?aba=grupos' },
    ],
    icons: [
      { src: '/brand/bl-afiliado-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-afiliado-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-afiliado-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/bl-afiliado-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
