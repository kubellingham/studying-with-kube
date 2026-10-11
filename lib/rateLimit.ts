// In-memory guard against runaway model spend. Resets when the server
// restarts, which is fine for a local, single-process test build.

import { serverConfig } from "./config";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface State {
  byIp: Map<string, number[]>;
  all: number[];
  activeByIp: Map<string, number>;
  active: number;
}

// Kept on globalThis so dev-mode hot reloads don't reset the counters.
const globalStore = globalThis as typeof globalThis & { __kubeRateLimit?: State };
const state: State = (globalStore.__kubeRateLimit ??= {
  byIp: new Map(),
  all: [],
  activeByIp: new Map(),
  active: 0,
});

export type Gate =
  | { ok: true; release: () => void }
  | { ok: false; message: string; retryAfterSec: number };

/** Call before spending money. On success, call release() when the generation ends. */
export function acquireGeneration(ip: string): Gate {
  const cfg = serverConfig();
  const now = Date.now();

  const ipHits = (state.byIp.get(ip) ?? []).filter((t) => t > now - HOUR);
  state.byIp.set(ip, ipHits);
  state.all = state.all.filter((t) => t > now - DAY);

  if ((state.activeByIp.get(ip) ?? 0) > 0) {
    return { ok: false, message: "A set is already being generated. Wait for it to finish.", retryAfterSec: 30 };
  }
  if (state.active >= cfg.maxConcurrent) {
    return { ok: false, message: "The server is busy. Try again in a minute.", retryAfterSec: 60 };
  }
  if (ipHits.length >= cfg.limitPerIpPerHour) {
    const wait = Math.ceil((ipHits[0] + HOUR - now) / 1000);
    return {
      ok: false,
      message: `Upload limit reached (${cfg.limitPerIpPerHour} per hour). Try again in ${Math.ceil(wait / 60)} min.`,
      retryAfterSec: wait,
    };
  }
  if (state.all.length >= cfg.limitPerDay) {
    const wait = Math.ceil((state.all[0] + DAY - now) / 1000);
    return {
      ok: false,
      message: `Daily generation limit reached (${cfg.limitPerDay} per day). Try again later.`,
      retryAfterSec: wait,
    };
  }

  ipHits.push(now);
  state.all.push(now);
  state.activeByIp.set(ip, (state.activeByIp.get(ip) ?? 0) + 1);
  state.active += 1;

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      state.active -= 1;
      const left = (state.activeByIp.get(ip) ?? 1) - 1;
      if (left > 0) state.activeByIp.set(ip, left);
      else state.activeByIp.delete(ip);
    },
  };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}
