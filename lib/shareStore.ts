import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountsState } from "./supabase/config";
import { supabaseAnonymous } from "./supabase/server";
import { STUDY_SET_VERSION, type StudySet } from "./types";

// Shareable study sets. With accounts on they live in Supabase (shared_sets):
// saved by the signed-in user who generated them, opened by anyone with the
// link through get_shared_set(id), which can't list sets. Without Supabase
// (local dev) they're kept in memory until the dev server restarts.
// (v1.1-v1.3 used a private Vercel Blob store; that store was suspended.)

const SHARE_ID = /^[A-Za-z0-9_-]{20}$/;

const globalStore = globalThis as typeof globalThis & { __kubeSharedSets?: Map<string, string> };
const memory = (globalStore.__kubeSharedSets ??= new Map<string, string>());

/** 15 random bytes as base64url: 20 URL-safe characters, 120 bits. */
function newShareId(): string {
  return randomBytes(15).toString("base64url");
}

/** Stores the set and returns its share id. `owner` is required when accounts are on. */
export async function saveSharedSet(
  set: StudySet,
  owner?: { supabase: SupabaseClient; userId: string },
): Promise<string> {
  const shareId = newShareId();
  const stored: StudySet = { ...set, shareId };
  if (accountsState() === "on") {
    if (!owner) throw new Error("Sharing needs a signed-in user.");
    const { error } = await owner.supabase
      .from("shared_sets")
      .insert({ id: shareId, created_by: owner.userId, study_set: stored });
    if (error) throw new Error(error.message);
  } else {
    memory.set(shareId, JSON.stringify(stored));
  }
  return shareId;
}

/** The stored set, or null if the id is malformed or unknown. */
export async function loadSharedSet(shareId: string): Promise<StudySet | null> {
  if (!SHARE_ID.test(shareId)) return null;

  let set: StudySet | null = null;
  if (accountsState() === "on") {
    const { data, error } = await supabaseAnonymous()!.rpc("get_shared_set", { p_id: shareId });
    if (error) throw new Error(error.message);
    set = data as StudySet | null;
  } else {
    const raw = memory.get(shareId);
    set = raw ? (JSON.parse(raw) as StudySet) : null;
  }
  return set?.version === STUDY_SET_VERSION && Array.isArray(set.flashcards) ? set : null;
}
