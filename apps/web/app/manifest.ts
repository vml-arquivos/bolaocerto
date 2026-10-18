import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BL — Bolão Livre',
    short_name: 'Bolão Livre',
    description: 'Concursos oficiais, cotas rastreáveis e acompanhamento do seu bolão.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#060c24',
    theme_color: '#060c24',
    lang: 'pt-BR',
    icons: [
      { src: '/brand/bl-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/bl-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
