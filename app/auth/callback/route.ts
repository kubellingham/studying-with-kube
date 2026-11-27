import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safeNext";
import { supabaseForRequest } from "@/lib/supabase/server";

// Google sends the browser here (through Supabase) after sign-in. Swapping the
// one-time code for a session sets the session cookies.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await supabaseForRequest();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("[kube] sign-in failed:", error.message);
  }
  const signin = new URL("/signin", request.url);
  signin.searchParams.set("error", "1");
  if (next !== "/") signin.searchParams.set("next", next);
  return NextResponse.redirect(signin);
}
