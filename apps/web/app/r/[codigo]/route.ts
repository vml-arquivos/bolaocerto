import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest, context: { params: Promise<{ codigo: string }> }) {
  return context.params.then(({ codigo }) => {
    const cleanCode = codigo.trim().slice(0, 20);
    const destination = new URL('/#boloes', request.url);
    const response = NextResponse.redirect(destination);
    if (cleanCode) {
      response.cookies.set('bl_ref', cleanCode, {
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
