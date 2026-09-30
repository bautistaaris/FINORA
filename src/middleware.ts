import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge middleware: valida cookie de sesión para todas las rutas no-públicas
// sin importar nada pesado (no bcrypt, no Prisma).
const PUBLIC_PATHS = new Set([
  "/login",
  "/manifest.json",
  "/sw.js",
  "/offline",
  "/robots.txt",
  "/api/health",
]);
const PUBLIC_PREFIXES = [
  "/_next/",
  "/icons/",
  "/api/auth/",
  "/api/health",
  "/api/bootstrap",
  "/favicon",
];
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();
  // Headers de seguridad por respuesta
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};