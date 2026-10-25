import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: redirects signed-out visitors away from the app. Every API route
// still re-verifies the session and role on the server.
const SESSION_COOKIE = "al_session";

async function isSignedIn(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const raw = process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? null : "dev-only-insecure-secret-change-me-please-32b");
  if (!raw) return false;
  const secret = new TextEncoder().encode(raw);
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const signedIn = await isSignedIn(req);
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/app") && !signedIn) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/signup") && signedIn) {
    return NextResponse.redirect(new URL("/app", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/login", "/signup"] };
