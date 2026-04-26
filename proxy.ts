import { NextRequest, NextResponse } from "next/server";

/** Must match sessionToken() in app/api/auth/route.ts — mixes in TOKEN_ENCRYPTION_KEY
 *  so the cookie value cannot be reproduced from the password alone via offline brute-force. */
async function sessionToken(password: string): Promise<string> {
  const secret = process.env.TOKEN_ENCRYPTION_KEY ?? "fallback";
  // Encode secret+password as one UTF-8 buffer (same byte sequence as Node's .update(secret).update(password))
  const data = new TextEncoder().encode(secret + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isAllowedCorsOrigin(origin: string): boolean {
  const defaults = new Set([
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://localhost",
    "https://app-sender.vercel.app",
  ]);

  if (defaults.has(origin)) return true;

  const extra = process.env.CORS_ALLOWED_ORIGINS;
  if (!extra) return false;

  return extra
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .includes(origin);
}

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedCorsOrigin(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  response.headers.set("Vary", "Origin");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const origin = request.headers.get("origin");
  const isNativeMobileOrigin =
    origin === "capacitor://localhost" || origin === "ionic://localhost";

  if (isApiRoute && request.method === "OPTIONS") {
    return withCors(request, new NextResponse(null, { status: 204 }));
  }

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/login")) {
    const res = NextResponse.next();
    return isApiRoute ? withCors(request, res) : res;
  }

  const password = process.env.APP_PASSWORD;
  if (!password) {
    const res = NextResponse.next();
    return isApiRoute ? withCors(request, res) : res;
  }

  // Native mobile app calls the hosted API cross-origin; skip password gate there.
  if (isApiRoute && isNativeMobileOrigin) {
    return withCors(request, NextResponse.next());
  }

  const expected = await sessionToken(password);
  const cookie = request.cookies.get("ghl_session");

  if (!cookie || cookie.value !== expected) {
    if (isApiRoute) {
      return withCors(
        request,
        NextResponse.json(
          { error: "unauthorized", message: "Authentication required" },
          { status: 401 }
        )
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();
  return isApiRoute ? withCors(request, res) : res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
