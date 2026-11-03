import { NextResponse, type NextRequest } from 'next/server';
import { routeByHost } from './lib/host-routing';

export function middleware(request: NextRequest) {
  const route = routeByHost({
    host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    adminHost: process.env['ADMIN_HOST'],
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    proto: request.headers.get('x-forwarded-proto'),
  });
  return route.action === 'redirect' ? NextResponse.redirect(route.url, 307) : NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|api/|brand/|sw\\.js|favicon\\.ico|icon\\.png|robots\\.txt|manifest\\.webmanifest|\\.well-known/).*)'],
};
