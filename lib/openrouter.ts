import { serverConfig } from "./config";

/** An error the user should see verbatim, and that retrying won't fix. */
export class FatalModelError extends Error {}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface ModelUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

export interface ModelResult {
  data: unknown;
  usage: ModelUsage | undefined;
}

interface CallOptions {
  /** Short name for server logs, e.g. "cards p12-23". */
  label: string;
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  maxTokens: number;
  signal: AbortSignal;
}

const ATTEMPT_TIMEOUT_MS = 90_000;
/** Don't start a retry this late; it would blow the ~30s target for the whole set. */
const RETRY_CUTOFF_MS = 40_000;

// If a model/provider rejects our optional parameters (strict JSON schema,
// reasoning effort), we fall back to a plain request and remember that for
// the rest of this server process.
let preferPlainRequest = false;

/**
 * Calls OpenRouter's chat completions endpoint and returns parsed JSON.
 * One retry on transient failures or unparseable output.
 */
export async function callModelJson(opts: CallOptions): Promise<ModelResult> {
  const startedAt = Date.now();
  let plain = preferPlainRequest;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await attemptCall(opts, plain);
      const u = result.usage;
      console.log(
        `[kube] ${opts.label}: ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
          (u ? `, ${u.prompt_tokens ?? "?"} in / ${u.completion_tokens ?? "?"} out tokens` : "") +
          (u?.cost != null ? `, $${u.cost.toFixed(4)}` : "") +
          (plain ? " (plain request)" : ""),
      );
      if (plain && !preferPlainRequest) preferPlainRequest = true;
      return result;
    } catch (err) {
      if (opts.signal.aborted || err instanceof FatalModelError) throw err;
      lastError = err;
      console.warn(`[kube] ${opts.label}: attempt ${attempt} failed: ${(err as Error).message}`);
      if (err instanceof HttpError && (err.status === 400 || err.status === 404 || err.status === 422)) {
        // 400: an optional parameter was rejected. 404: no provider supports
        // the parameters we required. Either way, retry without them.
        if (plain) throw err;
        plain = true;
      }
      if (Date.now() - startedAt > RETRY_CUTOFF_MS) break;
      await sleep(800, opts.signal);
    }
  }
  throw lastError;
}

async function attemptCall(opts: CallOptions, plain: boolean): Promise<ModelResult> {
  const cfg = serverConfig();
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens,
  };
  if (!plain) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
    };
    body.provider = { require_parameters: true };
    if (cfg.reasoningEffort) body.reasoning = { effort: cfg.reasoningEffort, exclude: true };
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "StudyingKube",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([opts.signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]),
  });

  const raw = await res.text();
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(raw);
  } catch {
    // handled below
  }

  const apiError = json?.error as { message?: string; code?: number } | undefined;
  if (!res.ok || apiError) {
    const status = res.ok ? Number(apiError?.code) || 502 : res.status;
    const message = apiError?.message || raw.slice(0, 200) || res.statusText;
    if (status === 401) {
      throw new FatalModelError("OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.local.");
    }
    if (status === 402) {
      throw new FatalModelError("The OpenRouter account is out of credits (or over its key limit). Top it up and try again.");
    }
    throw new HttpError(status, `OpenRouter ${status}: ${message}`);
  }

  const choice = (json?.choices as Array<{ message?: { content?: unknown }; finish_reason?: string }> | undefined)?.[0];
  const content = messageText(choice?.message?.content);
  if (!content) throw new Error(`empty response (finish_reason: ${choice?.finish_reason ?? "unknown"})`);

  const data = parseJsonLoose(content);
  if (data === undefined) {
    throw new Error(`response was not valid JSON (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  }
  return { data, usage: json?.usage as ModelUsage | undefined };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? ""))
      .join("")
      .trim();
  }
  return "";
}

/** Accepts bare JSON, JSON in a ``` fence, or JSON with stray prose around it. */
function parseJsonLoose(text: string): unknown {
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
