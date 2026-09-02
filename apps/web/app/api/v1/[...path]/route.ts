import type { NextRequest } from 'next/server';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const origin = (process.env.API_PROXY_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const target = new URL(`${origin}/api/v1/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('content-length');
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  try {
    const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding'); responseHeaders.delete('content-length'); responseHeaders.delete('transfer-encoding');
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: 'Serviço do BL temporariamente indisponível.' }, { status: 503 });
  }
}

export const GET = proxy; export const POST = proxy; export const PUT = proxy; export const PATCH = proxy; export const DELETE = proxy;
