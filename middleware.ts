import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Lightweight JWT expiry check for Edge middleware.
 * Full verification happens server-side via Firebase Admin SDK.
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return true;
    // Token is expired if exp is in the past (with 30s grace)
    return payload.exp * 1000 < Date.now() - 30000;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  if (host.startsWith('www.localdink.com')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = 'https';
    redirectUrl.host = 'localdink.com';
    return NextResponse.redirect(redirectUrl, 308);
  }

  const { pathname } = request.nextUrl;
  
  // Dashboard routes require authentication
  const isDashboardRoute = pathname.startsWith('/dashboard');
  
  if (isDashboardRoute) {
    const authToken = request.cookies.get('auth-token')?.value;
    
    if (!authToken || isTokenExpired(authToken)) {
      console.log('[Middleware] Missing or expired auth token, redirecting to login from:', pathname);
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      // Clear the stale cookie
      const response = NextResponse.redirect(loginUrl);
      if (authToken) {
        response.cookies.delete('auth-token');
      }
      return response;
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

