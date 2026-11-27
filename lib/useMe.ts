"use client";

import { useSyncExternalStore } from "react";
import type { Usage } from "./usage";

export interface Me {
  /** False when sign-in is off (local development without Supabase). */
  accounts: boolean;
  email?: string | null;
  name?: string | null;
  usage?: Usage | null;
}

// One shared copy of /api/me for the account menu and the uploader.
let current: Me | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Reloads who's signed in and their usage, e.g. after a generation. */
export function refreshMe(): Promise<void> {
  loading ??= fetch("/api/me", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: Me | null) => {
      current = data;
      for (const listener of listeners) listener();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!current) void refreshMe();
  return () => listeners.delete(listener);
}

export function useMe(): Me | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
