import { randomBytes } from "node:crypto";
import { get, put } from "@vercel/blob";
import { STUDY_SET_VERSION, type StudySet } from "./types";

// Server-side storage for shareable study sets: one private JSON blob per set
// in Vercel Blob, at sets/<shareId>.json. Blobs are private, so the only way
// to read one is through this app (behind the access password).
//
// Without Blob credentials (local dev) sets are kept in memory instead, so
// share links work until the dev server restarts. On Vercel without Blob
// credentials, sharing is simply switched off.

const PREFIX = "sets/";
const SHARE_ID = /^[A-Za-z0-9_-]{20}$/;

type Mode = "blob" | "memory" | "off";

function mode(): Mode {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "blob";
  return process.env.VERCEL ? "off" : "memory";
}

const globalStore = globalThis as typeof globalThis & { __kubeSharedSets?: Map<string, string> };
const memory = (globalStore.__kubeSharedSets ??= new Map<string, string>());

/** 15 random bytes as base64url: 20 URL-safe characters, 120 bits. */
function newShareId(): string {
  return randomBytes(15).toString("base64url");
}

export function sharingEnabled(): boolean {
  return mode() !== "off";
}

/** Stores the set and returns its share id. */
export async function saveSharedSet(set: StudySet): Promise<string> {
  const shareId = newShareId();
  const body = JSON.stringify({ ...set, shareId } satisfies StudySet);
  if (mode() === "blob") {
    await put(`${PREFIX}${shareId}.json`, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  } else {
    memory.set(shareId, body);
  }
  return shareId;
}

/** The stored set, or null if the id is malformed or unknown. */
export async function loadSharedSet(shareId: string): Promise<StudySet | null> {
  if (!SHARE_ID.test(shareId)) return null;

  let raw: string | undefined;
  if (mode() === "blob") {
    const result = await get(`${PREFIX}${shareId}.json`, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    raw = await new Response(result.stream).text();
  } else {
    raw = memory.get(shareId);
  }
  if (!raw) return null;

  const set = JSON.parse(raw) as StudySet;
  return set?.version === STUDY_SET_VERSION && Array.isArray(set.flashcards) ? set : null;
}
