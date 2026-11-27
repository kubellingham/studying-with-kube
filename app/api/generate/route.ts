import type { NextRequest } from "next/server";
import { LIMITS } from "@/lib/config";
import { generateStudySet } from "@/lib/generate";
import { modelSetupProblem } from "@/lib/model";
import { cleanSlides } from "@/lib/pdf";
import { acquireGeneration, clientIp } from "@/lib/rateLimit";
import { saveSharedSet } from "@/lib/shareStore";
import { accountsState } from "@/lib/supabase/config";
import { supabaseForRequest } from "@/lib/supabase/server";
import type { GenerateEvent, GenerateRequest } from "@/lib/types";
import { capMessage, completeGeneration, failGeneration, reserveGeneration, SignedOutError } from "@/lib/usage";

// Generation is ~30s of parallel model calls; give it headroom.
export const maxDuration = 120;

// POST JSON { fileName, pages: string[] }: the raw text of each PDF page or
// PowerPoint slide, extracted in the browser (lib/readSlides.ts). Validation errors come back as
// JSON with a 4xx/5xx status. Once generation starts, the response is a
// stream of newline-delimited GenerateEvent JSON.
//
// Privacy: the slides file never reaches the server, and its text only lives in this
// request's memory; it is never written anywhere or logged. What is stored is
// the generated study set (for its share link) and one usage row per upload.
export async function POST(req: NextRequest) {
  const setupProblem = modelSetupProblem();
  if (setupProblem) return fail(500, setupProblem);

  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (declaredSize > LIMITS.maxBodyBytes) return tooMuchText();

  let body: GenerateRequest;
  try {
    const raw = await req.text();
    if (raw.length > LIMITS.maxBodyBytes) return tooMuchText();
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Expected the text of a slides file.");
  }
  const pages = Array.isArray(body?.pages) ? body.pages : null;
  if (!pages || pages.length === 0 || !pages.every((p) => typeof p === "string")) {
    return fail(400, "Expected the text of a slides file.");
  }

  if (pages.length > LIMITS.maxPages) {
    return fail(413, `This file has ${pages.length} pages. Kube handles one unit at a time, up to ${LIMITS.maxPages} pages. Split it and upload one part.`);
  }
  const pdf = cleanSlides(pages);
  if (pdf.totalChars < LIMITS.minChars) {
    return fail(422, "This file has (almost) no selectable text. It looks scanned or image-only, and Kube can only read slides that contain real text.");
  }
  if (pdf.totalChars > LIMITS.maxChars) return tooMuchText();

  // Take a slot on the user's account only once we know we're about to spend money.
  // Without accounts (local dev), the old in-memory per-IP limits apply instead.
  const account = accountsState() === "on" ? await reserveSlot() : null;
  if (account instanceof Response) return account;
  const gate = account ? null : acquireGeneration(clientIp(req.headers));
  if (gate && !gate.ok) {
    return Response.json({ error: gate.message }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });
  }

  const fileName = (typeof body.fileName === "string" && body.fileName.trim().slice(0, 200)) || "slides.pdf";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: GenerateEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // client went away
        }
      };
      let finished = false;
      try {
        const { set, costUsd } = await generateStudySet({ fileName, pdf, signal: req.signal, emit });
        if (account) await completeGeneration(account.supabase, account.id, pdf.pageCount, costUsd);
        finished = true;
        let shareId: string | null = null;
        try {
          shareId = await saveSharedSet(set, account ?? undefined);
          set.shareId = shareId;
        } catch (err) {
          console.error("[kube] couldn't store set for sharing:", (err as Error).message);
          set.warnings.push("Couldn't create a share link for this set. Everything else works.");
        }
        emit({ type: "done", set, shareId });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[kube] generation failed:", (err as Error).message);
          emit({ type: "error", message: userMessage(err) });
        }
      } finally {
        // A failed or cancelled run doesn't count against the user's caps.
        if (account && !finished) await failGeneration(account.supabase, account.id);
        if (gate?.ok) gate.release();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/** The signed-in user's slot for this upload, or the response refusing it. */
async function reserveSlot() {
  const supabase = await supabaseForRequest();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const userId = data?.claims?.sub;
  if (!supabase || !userId) return fail(401, "You're signed out. Reload the page and sign in again.");
  try {
    const reservation = await reserveGeneration(supabase, "middle");
    if (!reservation.ok) return Response.json({ error: capMessage(reservation), quota: reservation }, { status: 429 });
    return { supabase, userId, id: reservation.id };
  } catch (err) {
    if (err instanceof SignedOutError) return fail(401, "You're signed out. Reload the page and sign in again.");
    console.error("[kube] couldn't reserve a generation:", (err as Error).message);
    return fail(503, "Couldn't check your account's usage just now. Try again in a minute.");
  }
}

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function tooMuchText() {
  return fail(413, "This file has more text than one unit of slides usually does. Split it and upload one part.");
}

function userMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout|aborted/i.test(message)) return "The AI model took too long to respond. Try again.";
  return message || "Something went wrong while generating. Try again.";
}
