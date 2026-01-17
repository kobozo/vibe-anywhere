import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that don't require authentication
const publicPaths = ['/api/auth/login', '/api/health', '/api/agent/bundle', '/api/chrome-bridge/download', '/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for public paths
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    // Actually, let the specific routes handle it
    // For now, let all through - API routes will check auth
    return NextResponse.next();
  }

  // For API routes, check for auth token
  if (pathname.startsWith('/api/')) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    // Token validation happens in the route handlers
    // Just pass through if token exists
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/sessions/:path*'],
};
