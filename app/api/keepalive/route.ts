import { supabaseAnonymous } from "@/lib/supabase/server";

// Called once a day by the Vercel cron in vercel.json. A free Supabase project
// pauses after a week without activity; one tiny query a day keeps it awake.
export async function GET() {
  const supabase = supabaseAnonymous();
  if (!supabase) return Response.json({ ok: false, error: "Supabase isn't configured." }, { status: 503 });
  const { data, error } = await supabase.rpc("keepalive");
  if (error) {
    console.error("[kube] keep-alive failed:", error.message);
    return Response.json({ ok: false }, { status: 502 });
  }
  return Response.json({ ok: true, at: data });
}
