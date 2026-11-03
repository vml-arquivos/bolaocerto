// Manifesto do aplicativo do PAINEL (equipe). O app do cliente tem outro manifesto (/manifest.webmanifest).
// id e scope diferentes permitem instalar os dois no mesmo aparelho, cada um com seu ícone.
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    id: '/admin',
    name: 'BL Admin — Painel da equipe',
    short_name: 'BL Admin',
    description: 'Painel de gestão do Bolão Livre: concursos, bolões, cotas, recebimentos e comprovantes.',
    start_url: '/admin?origem=pwa',
    scope: '/admin',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#04121a',
    theme_color: '#04121a',
    lang: 'pt-BR',
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    shortcuts: [
      { name: 'Resumo', short_name: 'Resumo', url: '/admin?view=visao-geral' },
      { name: 'Para fazer', short_name: 'Para fazer', url: '/admin?view=operacao' },
      { name: 'Comprovantes', short_name: 'Comprovantes', url: '/admin?view=comprovantes' },
      { name: 'Pagamentos', short_name: 'Pagamentos', url: '/admin?view=pagamentos' },
      { name: 'Mensagens aos clientes', short_name: 'Mensagens', url: '/admin?view=comunicados' },
    ],
    icons: [
      { src: '/brand/bl-admin-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-admin-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/bl-admin-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
