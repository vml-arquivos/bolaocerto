// Manifesto do aplicativo do CLIENTE. O painel da equipe tem outro (/admin/manifest.webmanifest), com outro id, escopo e ícone.
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    id: '/',
    name: 'BL — Bolão Livre',
    short_name: 'Bolão Livre',
    description: 'Concursos oficiais, cotas rastreáveis e acompanhamento do seu bolão.',
    start_url: '/aplicativo?origem=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    categories: ['finance', 'lifestyle'],
    prefer_related_applications: false,
    background_color: '#060c24',
    theme_color: '#060c24',
    lang: 'pt-BR',
    shortcuts: [
      { name: 'Bolões disponíveis', url: '/aplicativo' },
      { name: 'Minhas cotas e pagamentos', url: '/minha-conta' },
      { name: 'Resultados', url: '/resultados' },
      { name: 'Meus contratos', url: '/minha-conta/contratos' },
    ],
    icons: [
      { src: '/brand/bl-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/bl-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
