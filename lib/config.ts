// Server-side limits and settings. Everything that costs money is bounded here.

export const LIMITS = {
  /** Upload size cap. The brief targets ~15 MB; a little headroom for image-heavy decks. */
  maxFileBytes: 20 * 1024 * 1024,
  /** The brief targets ~70 pages; anything far beyond that is not a single unit. */
  maxPages: 100,
  /** Extracted-text cap (~50k tokens). Bounds the input cost of one generation. */
  maxChars: 200_000,
  /** Below this the PDF is almost certainly scanned / image-only. */
  minChars: 300,
};

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

function intFromEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function serverConfig() {
  const effort = process.env.OPENROUTER_REASONING_EFFORT?.trim() || "low";
  return {
    apiKey: process.env.OPENROUTER_API_KEY?.trim() || "",
    baseUrl: (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    /** "off" sends no reasoning setting and lets the model use its default. */
    reasoningEffort: effort === "off" ? null : effort,
    limitPerIpPerHour: intFromEnv("KUBE_LIMIT_PER_IP_PER_HOUR", 10),
    limitPerDay: intFromEnv("KUBE_LIMIT_PER_DAY", 50),
    maxConcurrent: intFromEnv("KUBE_MAX_CONCURRENT", 3),
  };
}
