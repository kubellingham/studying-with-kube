import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

/**
 * Supabase as the signed-in user, from the session cookies (server code only).
 * Null when Supabase isn't configured.
 */
export async function supabaseForRequest(): Promise<SupabaseClient | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const store = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** Supabase with no user, for share links and the keep-alive. */
export function supabaseAnonymous(): SupabaseClient | null {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
