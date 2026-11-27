// Supabase connection settings. Both values are public: the publishable key is
// meant to be used in browsers, and what each user can do is decided by
// row-level security and the functions in supabase/migrations. The app holds
// no Supabase secret key.

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * Accounts (sign-in and per-account caps) are on whenever Supabase is
 * configured. Without it, local development runs open, as v1.3 did; a
 * deployment on Vercel refuses to serve instead of running without caps.
 */
export function accountsState(): "on" | "off" | "missing" {
  if (supabaseConfig()) return "on";
  return process.env.VERCEL ? "missing" : "off";
}

export const ACCOUNTS_MISSING_MESSAGE =
  "Sign-in isn't configured on this deployment: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing.";
