import type { ReactNode } from 'react';

/**
 * Texto do blog em Markdown simples, transformado em elementos React (sem HTML cru: nada do texto vira script).
 * Aceita: ## e ### títulos, parágrafos, **negrito**, *itálico*, [link](https://...), ![imagem](url), listas com - ou 1.,
 * > citação e linha --- . É o mesmo formato que o painel mostra na prévia.
 */
const SAFE_URL = /^(https?:\/\/|\/(?!\/))/i;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0; let match: RegExpExecArray | null; let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const k = `${key}-${i++}`;
    if (match[2]) out.push(<strong key={k}>{match[2]}</strong>);
    else if (match[3]) out.push(<em key={k}>{match[3]}</em>);
    else if (match[4] && match[5]) {
      const url = match[5];
      if (SAFE_URL.test(url)) { const external = /^https?:/i.test(url); out.push(<a key={k} href={url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{match[4]}</a>); }
      else out.push(match[4]);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Títulos do texto (para o sumário e para âncoras). */
export function headingId(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0; let n = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${n++}`;
    if (!line.trim()) { i += 1; continue; }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) { const text = heading[2]!.trim(); blocks.push(heading[1] === '##' ? <h2 key={key} id={headingId(text)}>{inline(text, key)}</h2> : <h3 key={key} id={headingId(text)}>{inline(text, key)}</h3>); i += 1; continue; }
    if (/^-{3,}\s*$/.test(line)) { blocks.push(<hr key={key} />); i += 1; continue; }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (image) { if (SAFE_URL.test(image[2]!)) blocks.push(<figure key={key}><img src={image[2]} alt={image[1]} loading="lazy" decoding="async" />{image[1] && <figcaption>{image[1]}</figcaption>}</figure>); i += 1; continue; }
    if (/^>\s?/.test(line)) { const quote: string[] = []; while (i < lines.length && /^>\s?/.test(lines[i]!)) { quote.push(lines[i]!.replace(/^>\s?/, '')); i += 1; } blocks.push(<blockquote key={key}>{inline(quote.join(' '), key)}</blockquote>); continue; }
    if (/^[-*]\s+/.test(line)) { const items: string[] = []; while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^[-*]\s+/, '')); i += 1; } blocks.push(<ul key={key}>{items.map((item, j) => <li key={j}>{inline(item, `${key}-${j}`)}</li>)}</ul>); continue; }
    if (/^\d+[.)]\s+/.test(line)) { const items: string[] = []; while (i < lines.length && /^\d+[.)]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\d+[.)]\s+/, '')); i += 1; } blocks.push(<ol key={key}>{items.map((item, j) => <li key={j}>{inline(item, `${key}-${j}`)}</li>)}</ol>); continue; }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,3}\s|>|[-*]\s|\d+[.)]\s|!\[|-{3,}\s*$)/.test(lines[i]!)) { paragraph.push(lines[i]!.trim()); i += 1; }
    blocks.push(<p key={key}>{inline(paragraph.join(' '), key)}</p>);
  }
  return <>{blocks}</>;
}

/** Tempo de leitura em minutos (200 palavras por minuto). */
export function readingMinutes(source: string): number {
  return Math.max(1, Math.round(source.split(/\s+/).filter(Boolean).length / 200));
}
