// Server-side limits and settings. Everything that costs money is bounded here.

export const LIMITS = {
  /** PDF size cap, checked in the browser (the PDF itself is never uploaded). */
  maxFileBytes: 20 * 1024 * 1024,
  /**
   * Cap on the JSON of extracted page text sent to /api/generate. Comfortably
   * above 200k characters of text, well under Vercel's 4.5 MB request limit.
   */
  maxBodyBytes: 3 * 1024 * 1024,
  /** The brief targets ~70 pages; anything far beyond that is not a single unit. */
  maxPages: 100,
  /** Extracted-text cap (~50k tokens). Bounds the input cost of one generation. */
  maxChars: 200_000,
  /** Below this the PDF is almost certainly scanned / image-only. */
  minChars: 300,
};

function intFromEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Upload limits. Model/provider settings live in lib/providers/. */
export function serverConfig() {
  return {
    limitPerIpPerHour: intFromEnv("KUBE_LIMIT_PER_IP_PER_HOUR", 10),
    limitPerDay: intFromEnv("KUBE_LIMIT_PER_DAY", 50),
    maxConcurrent: intFromEnv("KUBE_MAX_CONCURRENT", 3),
  };
}
