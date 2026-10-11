import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessPassword, hasValidAccessCookie } from "@/lib/access";

// Shared-password gate in front of every page and API route.
// - KUBE_ACCESS_PASSWORD unset (local dev): does nothing.
// - Pages without a valid cookie are answered with the /unlock page instead,
//   at the same URL. Nothing about the requested page or set is sent, and
//   after unlocking the browser just reloads the URL it was on.
// - API calls without a valid cookie get a 401.
export async function proxy(request: NextRequest) {
  const password = accessPassword();
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/unlock" || pathname === "/api/unlock") return NextResponse.next();

  if (await hasValidAccessCookie(request.cookies.get(ACCESS_COOKIE)?.value, password)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Enter the access password first: reload the page." }, { status: 401 });
  }

  const response = NextResponse.rewrite(new URL("/unlock", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Everything except build assets and the icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
