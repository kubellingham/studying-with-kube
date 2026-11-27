import { accountsState } from "@/lib/supabase/config";
import { supabaseForRequest } from "@/lib/supabase/server";

// Who is signed in, for the account menu. { accounts: false } when sign-in is
// off (local development without Supabase).
export async function GET() {
  if (accountsState() !== "on") return Response.json({ accounts: false });
  const supabase = await supabaseForRequest();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  if (!data?.claims?.sub) return Response.json({ error: "Not signed in." }, { status: 401 });
  const meta = (data.claims.user_metadata ?? {}) as Record<string, unknown>;
  return Response.json({
    accounts: true,
    email: data.claims.email ?? null,
    name: typeof meta.full_name === "string" ? meta.full_name : null,
  });
}
