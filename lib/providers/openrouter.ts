import { effortFromEnv, env, type Provider } from "./types";

/** Haiku tier by default: the free tier will ship on cheap models (DECISIONS.md). */
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

export const openrouter: Provider = {
  id: "openrouter",
  label: "OpenRouter",
  keyEnv: "OPENROUTER_API_KEY",
  modelEnv: "OPENROUTER_MODEL",

  settings() {
    return {
      apiKey: env("OPENROUTER_API_KEY"),
      baseUrl: env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
      model: env("OPENROUTER_MODEL", OPENROUTER_DEFAULT_MODEL),
      reasoningEffort: effortFromEnv("OPENROUTER_REASONING_EFFORT"),
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
    if (!plain) {
      // Strict JSON-schema output, routed only to providers that support it.
      body.response_format = {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      };
      body.provider = { require_parameters: true };
      if (settings.reasoningEffort) body.reasoning = { effort: settings.reasoningEffort, exclude: true };
    }
    return body;
  },

  extraHeaders: { "X-Title": "StudyingKube" },

  isOutOfCredit: (status) => status === 402,

  costOf(response) {
    const cost = (response.usage as { cost?: unknown } | undefined)?.cost;
    return typeof cost === "number" ? cost : undefined;
  },
};
