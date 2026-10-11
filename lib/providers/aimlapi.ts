import { effortFromEnv, env, type Provider } from "./types";

/** Same Haiku model as the OpenRouter default; AI/ML API uses the same id. */
export const AIMLAPI_DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

// AI/ML API (https://aimlapi.com), OpenAI-compatible chat completions.
// Checked against its per-model API reference (Oct 2026), see DECISIONS.md:
// - Claude models accept `reasoning_effort` but document no `response_format`,
//   so there is no schema enforcement. The JSON shape spelled out in the
//   prompts plus the lenient parsing in lib/model.ts carry the load instead.
// - Out of credit is a 403 ("You've run out of credits"), not a 402.
// - Cost comes back as meta.usage.usd_spent.
export const aimlapi: Provider = {
  id: "aimlapi",
  label: "AI/ML API",
  keyEnv: "AIMLAPI_API_KEY",
  modelEnv: "AIMLAPI_MODEL",

  settings() {
    return {
      apiKey: env("AIMLAPI_API_KEY"),
      baseUrl: env("AIMLAPI_BASE_URL", "https://api.aimlapi.com/v1").replace(/\/+$/, ""),
      model: env("AIMLAPI_MODEL", AIMLAPI_DEFAULT_MODEL),
      reasoningEffort: effortFromEnv("AIMLAPI_REASONING_EFFORT"),
    };
  },

  buildBody(request, settings, plain) {
    const body: Record<string, unknown> = {
      model: settings.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      max_tokens: request.maxTokens,
    };
    if (!plain && settings.reasoningEffort) body.reasoning_effort = settings.reasoningEffort;
    return body;
  },

  isOutOfCredit: (status, message) =>
    status === 402 || (status === 403 && /credit|balance|top up|billing/i.test(message)),

  costOf(response) {
    const spent = (response.meta as { usage?: { usd_spent?: unknown } } | undefined)?.usage?.usd_spent;
    return typeof spent === "number" ? spent : undefined;
  },
};
