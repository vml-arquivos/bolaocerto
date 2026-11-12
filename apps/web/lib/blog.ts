/** Post do blog como a API entrega. */
export type BlogPostSummary = { id: string; slug: string; titulo: string; resumo: string; imagem: string | null; imagemAlt: string | null; categoria: string | null; publicadoEm: string | null; atualizadoEm: string; autor: string | null; seoTitulo: string | null; seoDescricao: string | null; palavrasChave: string | null };
export type BlogPost = BlogPostSummary & { conteudo: string; status: 'rascunho' | 'publicado'; criadoEm: string };
export type SiteSeo = { titulo: string; descricao: string; palavrasChave: string | null; imagem: string | null };

export const DEFAULT_SEO: SiteSeo = {
  titulo: 'Bolão Livre — bolões de concursos oficiais',
  descricao: 'Participe de bolões da Mega-Sena, Lotofácil, Quina e outras modalidades com cotas rastreáveis, resultado oficial e comprovantes na sua conta.',
  palavrasChave: null,
  imagem: null,
};

export function postDate(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value));
}

/** Imagens do blog vêm da API (/api/v1/...): no navegador o próprio site responde nesse caminho; para SEO vira link completo. */
export function absolute(url: string | null | undefined, origin: string): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}
