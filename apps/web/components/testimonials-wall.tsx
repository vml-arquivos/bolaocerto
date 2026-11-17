import Link from 'next/link';
import { Stars, TestimonialCard, type PublicTestimonial } from './testimonials';

/**
 * Página principal (site e app): todos os comentários dos cotistas, com nome, estrelas e texto,
 * numa faixa que rola para o lado (no celular, arrastando). A nota média fica em destaque.
 */
export function TestimonialsWall({ data, id = 'depoimentos', inApp = false }: { data: { total: number; media: number; items: PublicTestimonial[] } | null | undefined; id?: string; inApp?: boolean }) {
  const items = data?.items ?? [];
  if (!items.length) return null;
  const total = data?.total ?? items.length;
  return <section className={`testimonials-wall ${inApp ? 'is-app' : 'section shell'}`} id={id} aria-labelledby={`${id}-titulo`}>
    <div className="section-title">
      <div><span className="overline">Quem participa</span><h2 id={`${id}-titulo`}>O que dizem os cotistas</h2><p>Todos os comentários de quem participa, com o nome, as estrelas e o que escreveu.</p></div>
      <div className="testimonials-score" aria-label={`Nota média ${data!.media.toLocaleString('pt-BR')} de 5 em ${total} ${total === 1 ? 'comentário' : 'comentários'}`}>
        <strong>{data!.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
        <div><Stars value={data!.media} /><small>{total} {total === 1 ? 'comentário' : 'comentários'}</small></div>
      </div>
    </div>
    <div className="testimonials-strip" role="list" tabIndex={0} aria-label="Comentários dos cotistas (role para o lado para ver todos)">
      {items.map((item) => <div role="listitem" key={item.id} className="testimonials-strip-item"><TestimonialCard item={item} /></div>)}
    </div>
    <div className="testimonials-actions"><Link className="section-link" href="/depoimentos">Ver todos em uma página →</Link><Link className="section-link" href="/minha-conta?aba=conta&abrir=depoimento">Deixar meu comentário</Link></div>
  </section>;
}
