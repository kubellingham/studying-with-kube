import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNTS_MISSING_MESSAGE, accountsState, supabaseConfig } from "@/lib/supabase/config";

// Google sign-in in front of every page and API route (replaces v1.3's shared
// password). On each request this also refreshes the Supabase session, so the
// cookies Server Components and route handlers read are current.
// - Signed out: pages redirect to /signin (and come back after), API calls get a 401.
// - Open to everyone: the sign-in pages, share links (/s/<id>) and the keep-alive.
// - Supabase not configured: local dev runs open; on Vercel nothing is served.

const PUBLIC_PATHS = [/^\/signin$/, /^\/auth\//, /^\/s\/[^/]+$/, /^\/api\/keepalive$/];

export async function proxy(request: NextRequest) {
  const state = accountsState();
  if (state === "off") return NextResponse.next();
  if (state === "missing") return new NextResponse(ACCOUNTS_MISSING_MESSAGE, { status: 503 });

  const cfg = supabaseConfig()!;
  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Verifies the session token (refreshing it if it's about to expire).
  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  if (data?.claims?.sub || PUBLIC_PATHS.some((path) => path.test(pathname))) return response;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "You're signed out. Reload the page and sign in again." }, { status: 401 });
  }
  const signin = request.nextUrl.clone();
  signin.pathname = "/signin";
  signin.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(signin);
}

export const config = {
  // Everything except build assets and the icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
