import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '../../components/site-header';
import { apiGet } from '../../lib/api';
import { money } from '../../lib/domain';

export const metadata: Metadata = { title: 'Verificar recibo', robots: { index: false } };

type Verification = { valido: boolean; numero?: string; titular?: string; bolao?: string; cotas?: number; valorPago?: string; confirmadoEm?: string };

export default async function VerifyReceiptPage({ searchParams }: { searchParams: Promise<{ cota?: string; codigo?: string }> }) {
  const { cota, codigo } = await searchParams;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const result = cota && codigo && uuid.test(cota) ? await apiGet<Verification>(`/recibos/${cota}/verificar?codigo=${encodeURIComponent(codigo)}`) : null;
  const data = result?.data;
  return <><SiteHeader /><main className="document-page shell" id="main-content">
    <span className="overline">Autenticidade</span><h1>Verificação de recibo</h1>
    {!result ? <p>Abra o link impresso no seu recibo, ou informe o número da cota e o código de verificação na barra de endereço (<code>?cota=…&amp;codigo=…</code>).</p>
      : result.error ? <div className="notice notice-error"><strong>Não foi possível verificar agora</strong><span>{result.error}</span></div>
      : data?.valido ? <div className="notice"><strong>Recibo autêntico ✔</strong><span>Recibo {data.numero} · {data.titular} · {data.bolao}</span><span>{data.cotas} cota(s) · {money(data.valorPago)} · pago em {data.confirmadoEm ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(data.confirmadoEm)) : '—'}</span></div>
      : <div className="notice notice-error"><strong>Recibo não encontrado ou código inválido</strong><span>Confira se o código foi digitado exatamente como está no recibo. Em caso de dúvida, fale com o suporte.</span></div>}
  </main><SiteFooter /></>;
}
