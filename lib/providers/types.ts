// What a model provider has to supply. Both providers speak the OpenAI-style
// chat completions protocol, so the shared request/retry/parse logic lives in
// lib/model.ts and a provider only describes its own differences.

export type ProviderId = "openrouter" | "aimlapi";

export interface ProviderSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** null = send no reasoning setting and let the model use its default. */
  reasoningEffort: string | null;
}

/** One JSON-producing model call, as the engine describes it. */
export interface JsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  maxTokens: number;
}

export interface Provider {
  id: ProviderId;
  /** Human name used in error messages and logs. */
  label: string;
  /** Env var names, so error messages can point at the right one. */
  keyEnv: string;
  modelEnv: string;
  settings(): ProviderSettings;
  /**
   * The request body. `plain` drops every optional extra (schema enforcement,
   * reasoning) and is used after the provider rejects one of them.
   */
  buildBody(request: JsonRequest, settings: ProviderSettings, plain: boolean): Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  /** Does this error response mean the account has no credit left? */
  isOutOfCredit(status: number, message: string): boolean;
  /** The USD cost of a call, if the response reports it. */
  costOf(response: Record<string, unknown>): number | undefined;
}

/** `VALUE` trimmed, or the fallback when unset or empty. */
export function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

/** Reasoning effort from an env var; default "low", "off" disables it. */
export function effortFromEnv(name: string): string | null {
  const effort = env(name, "low");
  return effort === "off" ? null : effort;
}
