import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../../components/site-header';
import { apiGet } from '../../lib/api';
import { siteUrl } from '../../lib/site-url';
import { Stars, TestimonialCard, type PublicTestimonial } from '../../components/testimonials';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteUrl();
  const title = 'Depoimentos de quem participa';
  const description = 'O que os cotistas dizem sobre participar dos bolões do Bolão Livre e sobre os afiliados.';
  return { title, description, alternates: { canonical: `${origin}/depoimentos` }, openGraph: { title, description, url: `${origin}/depoimentos`, type: 'website', locale: 'pt_BR', siteName: 'Bolão Livre' } };
}

export default async function TestimonialsPage() {
  const { data } = await apiGet<{ total: number; media: number; items: PublicTestimonial[] }>('/depoimentos?limite=50');
  const items = data?.items ?? [];
  return <><SiteHeader /><main id="main-content" className="blog-page">
    <section className="shell blog-hero"><nav className="blog-crumbs" aria-label="Você está em"><Link href="/">Início</Link><span aria-hidden="true">›</span><span>Depoimentos</span></nav>
      <span className="overline">Quem participa</span><h1>Depoimentos</h1>
      <p>{data && data.total ? <span className="testimonial-summary inline"><Stars value={data.media} /> <strong>{data.media.toLocaleString('pt-BR')}</strong> de 5 · {data.total} {data.total === 1 ? 'depoimento' : 'depoimentos'}</span> : 'Ainda não há depoimentos publicados.'}</p>
    </section>
    <section className="shell blog-body">
      {items.length ? <div className="testimonial-grid">{items.map((item) => <TestimonialCard key={item.id} item={item} />)}</div> : <div className="blog-empty"><strong>Seja o primeiro a contar sua experiência.</strong></div>}
      <div className="blog-cta"><div><strong>Já participou de um bolão?</strong><span>Conte como foi. Seu depoimento aparece aqui depois da aprovação da equipe.</span></div><Link className="button button-primary" href="/minha-conta?aba=conta&abrir=depoimento">Escrever meu depoimento</Link></div>
    </section>
  </main><SiteFooter /></>;
}
