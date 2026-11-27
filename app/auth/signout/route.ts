import { NextResponse, type NextRequest } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await supabaseForRequest();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/signin", request.url), { status: 303 });
}
