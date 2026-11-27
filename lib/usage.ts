// Per-account caps (v1.4). The rules live in the database (supabase/migrations:
// quota, reserve_generation); this file calls them as the signed-in user and
// turns their answers into plain-English messages.

import type { SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "./config";

export type Mode = "middle" | "panic" | "comprehensive";

export interface Quota {
  mode: Mode;
  plan: "free" | "paid";
  limit: number;
  used: number;
  left: number;
  /** "day": resets at midnight India time; "month": on the 1st. */
  per: "day" | "month";
  resets_at: string;
}

export type Usage = Record<Mode, Quota>;

export type Reservation =
  | (Quota & { ok: true; id: string })
  | (Partial<Quota> & { ok: false; reason: "limit" | "busy" | "site_limit" });

export class SignedOutError extends Error {}

/** Takes one generation slot for the signed-in user, or says why not. */
export async function reserveGeneration(supabase: SupabaseClient, mode: Mode): Promise<Reservation> {
  const { data, error } = await supabase.rpc("reserve_generation", {
    p_mode: mode,
    p_daily_cap: serverConfig().limitPerDay,
  });
  if (error) {
    if (error.code === "28000" || /not signed in|jwt/i.test(error.message)) throw new SignedOutError(error.message);
    throw new Error(error.message);
  }
  return data as Reservation;
}

/** Counts the generation. Called before the set is sent, so the usage shown next is current. */
export async function completeGeneration(supabase: SupabaseClient, id: string, pages: number, costUsd: number) {
  const { error } = await supabase.rpc("complete_generation", { p_id: id, p_pages: pages, p_cost_usd: costUsd });
  if (error) console.error("[kube] couldn't record a finished generation:", error.message);
}

/** Gives the slot back after a failed or cancelled generation. */
export async function failGeneration(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.rpc("fail_generation", { p_id: id });
  if (error) console.error("[kube] couldn't refund a failed generation:", error.message);
}

export async function usageSummary(supabase: SupabaseClient): Promise<Usage | null> {
  const { data, error } = await supabase.rpc("usage_summary");
  if (error) {
    console.error("[kube] couldn't read usage:", error.message);
    return null;
  }
  return data as Usage;
}

const MODE_NAMES: Record<Mode, string> = { middle: "sets", panic: "Panic sessions", comprehensive: "Comprehensive sets" };

/** Why a reservation was refused, for the person who asked. */
export function capMessage(r: Extract<Reservation, { ok: false }>): string {
  if (r.reason === "busy") return "A set is already being made on your account. Wait for it to finish, then try again.";
  if (r.reason === "site_limit") return "StudyingKube has reached its limit for today. Try again tomorrow.";
  if (r.limit === 0) return "Comprehensive is part of the paid plan.";
  const when = r.per === "month" ? `on ${shortDate(r.resets_at)}` : "at midnight (India time)";
  if (r.mode === "panic" && r.plan === "free") {
    return `You've used this month's free Panic session. The next one unlocks ${when}.`;
  }
  const what = r.plan === "free" ? `your ${r.limit} free ${MODE_NAMES[r.mode ?? "middle"]} for today` : `today's ${r.limit} ${MODE_NAMES[r.mode ?? "middle"]}`;
  return `You've made ${what}. More ${when}.`;
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "the 1st";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
