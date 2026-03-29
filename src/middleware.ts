import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge-compatible middleware.
 *
 * This runs in the Edge Runtime — no SQLite, no Node.js-only modules.
 * It performs lightweight cookie-presence checks only.
 * Actual session validation happens in withAuth() (Node.js runtime).
 */

// Pages that never require authentication
const PUBLIC_PAGES = new Set(["/login", "/setup", "/register"]);

// API routes that are always public
const PUBLIC_API_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/totp/verify",
  "/api/health",
  "/api/collector/ingest",
]);

// API prefixes that are always public (for sub-routes)
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/register"];

function isPublicRoute(pathname: string): boolean {
  // Check exact page matches
  if (PUBLIC_PAGES.has(pathname)) return true;

  // Check exact API route matches
  if (PUBLIC_API_ROUTES.has(pathname)) return true;

  // Check API prefix matches
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix + "/"))) {
    return true;
  }

  return false;
}

function hasSessionCookie(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get("tenacitos_session");
  return !!(sessionCookie && sessionCookie.value);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie presence (not validity — that's done in withAuth)
  if (!hasSessionCookie(request)) {
    // For API routes: return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // For page routes: redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (with extension)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
