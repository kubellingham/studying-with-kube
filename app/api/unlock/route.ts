import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, accessPassword, accessToken, passwordMatches } from "@/lib/access";

// POST { password } -> sets the access cookie if it matches KUBE_ACCESS_PASSWORD.
export async function POST(request: NextRequest) {
  const password = accessPassword();
  if (!password) return NextResponse.json({ ok: true });

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const attempt = typeof body?.password === "string" ? body.password.trim() : "";

  if (!attempt || !(await passwordMatches(attempt, password))) {
    // Slow down guessing. The password itself should be long enough that this barely matters.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return NextResponse.json({ error: "That's not the password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, await accessToken(password), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}
