import type { NextRequest } from "next/server";
import { LIMITS, serverConfig } from "@/lib/config";
import { generateStudySet } from "@/lib/generate";
import { extractSlides, PdfReadError, type ExtractedPdf } from "@/lib/pdf";
import { acquireGeneration, clientIp } from "@/lib/rateLimit";
import type { GenerateEvent } from "@/lib/types";

// Generation is ~30s of parallel model calls; give it headroom.
export const maxDuration = 120;

// POST multipart/form-data with a "file" field (the PDF).
// Validation errors come back as JSON with a 4xx/5xx status. Once generation
// starts, the response is a stream of newline-delimited GenerateEvent JSON.
//
// Privacy: the PDF only ever lives in this request's memory. Nothing is
// written to disk, cached, or logged; it is gone when the request ends.
export async function POST(req: NextRequest) {
  if (!serverConfig().apiKey) {
    return fail(500, "The server has no OPENROUTER_API_KEY. Add it to .env.local and restart (see README).");
  }

  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (declaredSize > LIMITS.maxFileBytes + 1024 * 1024) return tooBig();

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return fail(400, "Expected a PDF upload.");
  }
  if (!(file instanceof File) || file.size === 0) return fail(400, "Expected a PDF upload.");
  if (file.size > LIMITS.maxFileBytes) return tooBig();

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 1024)).indexOf("%PDF-") === -1) {
    return fail(415, "That file isn't a PDF. v1 only reads PDF lecture slides.");
  }

  let pdf: ExtractedPdf;
  try {
    pdf = await extractSlides(bytes);
  } catch (err) {
    if (err instanceof PdfReadError) return fail(422, err.message);
    console.error("[kube] PDF extraction failed:", (err as Error).message);
    return fail(422, "Couldn't read this PDF.");
  }

  if (pdf.pageCount > LIMITS.maxPages) {
    return fail(413, `This PDF has ${pdf.pageCount} pages. v1 handles one unit at a time, up to ${LIMITS.maxPages} pages. Split it and upload one part.`);
  }
  if (pdf.totalChars < LIMITS.minChars) {
    return fail(422, "This PDF has (almost) no selectable text. It looks scanned or image-only, and v1 can only read text-based PDFs.");
  }
  if (pdf.totalChars > LIMITS.maxChars) {
    return fail(413, "This PDF has more text than one unit of slides usually does. Split it and upload one part.");
  }

  // Rate limit only once we know we're about to spend money.
  const gate = acquireGeneration(clientIp(req.headers));
  if (!gate.ok) {
    return Response.json({ error: gate.message }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });
  }

  const fileName = file.name || "slides.pdf";
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
      try {
        const set = await generateStudySet({ fileName, pdf, signal: req.signal, emit });
        emit({ type: "done", set });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[kube] generation failed:", (err as Error).message);
          emit({ type: "error", message: userMessage(err) });
        }
      } finally {
        gate.release();
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

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function tooBig() {
  return fail(413, `That file is over ${LIMITS.maxFileBytes / (1024 * 1024)} MB. v1 takes one unit of slides at a time.`);
}

function userMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout|aborted/i.test(message)) return "The AI model took too long to respond. Try again.";
  return message || "Something went wrong while generating. Try again.";
}
