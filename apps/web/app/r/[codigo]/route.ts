import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiGet } from '../../../lib/api';

type Info = { valido: boolean; tipo?: 'afiliado' | 'cliente' | 'indicacao' | 'equipe' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Link do BL:
 *  - /r/CODIGO              → indicação do afiliado (vai para os bolões) ou convite (vai para o cadastro);
 *  - /r/CODIGO?bolao=ID     → link de venda de um bolão: abre o bolão e guarda o afiliado para a compra.
 */
export function GET(request: NextRequest, context: { params: Promise<{ codigo: string }> }) {
  return context.params.then(async ({ codigo }) => {
    const cleanCode = codigo.trim().slice(0, 40);
    const pool = request.nextUrl.searchParams.get('bolao') ?? '';
    const info = cleanCode ? await apiGet<Info>(`/auth/convite/${encodeURIComponent(cleanCode)}`) : { data: null, error: 'sem código' };
    // Se o servico estiver fora do ar, mantém o comportamento antigo (guarda o código e segue).
    const unknown = !info.data;
    if (info.data && !info.data.valido) return NextResponse.redirect(new URL('/#boloes', request.url));
    const invite = info.data?.tipo === 'afiliado' || info.data?.tipo === 'cliente' || info.data?.tipo === 'equipe';
    const destination = invite ? `/cadastro?convite=${encodeURIComponent(cleanCode)}` : UUID.test(pool) ? `/boloes/${pool}` : '/#boloes';
    const response = NextResponse.redirect(new URL(destination, request.url));
    if (cleanCode && (invite || unknown || info.data?.tipo === 'indicacao')) {
      response.cookies.set('bl_ref', cleanCode.slice(0, 20), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
    }
    return response;
  });
}
