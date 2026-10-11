import { randomUUID } from "node:crypto";
import { chunkPages, formatPages, type PageChunk } from "./chunk";
import { dedupeFlashcards, mergeSections, normalizeCards, normalizeSummary } from "./normalize";
import { activeProvider, callModelJson, FatalModelError, type ModelUsage } from "./model";
import type { ExtractedPdf } from "./pdf";
import {
  CARDS_SCHEMA,
  CARDS_SYSTEM,
  cardsUserPrompt,
  SUMMARY_SCHEMA,
  SUMMARY_SYSTEM,
  summaryUserPrompt,
} from "./prompts";
import { STUDY_SET_VERSION, type GenerateEvent, type StudySet } from "./types";

// Flashcards/MCQs are written per ~6k-character run of pages (about 8-20
// slides); the summary per ~24k characters. All calls run in parallel, so the
// whole set takes about as long as the slowest single call.
const CARD_CHUNK_CHARS = 6_000;
const MAX_CARD_CHUNKS = 10;
const SUMMARY_CHUNK_CHARS = 24_000;
const MAX_SUMMARY_PARTS = 4;

interface GenerateArgs {
  fileName: string;
  pdf: ExtractedPdf;
  signal: AbortSignal;
  emit: (event: GenerateEvent) => void;
}

export async function generateStudySet({ fileName, pdf, signal, emit }: GenerateArgs): Promise<StudySet> {
  const provider = activeProvider();
  const { model } = provider.settings();
  const allowedPages = new Set(pdf.pages.map((p) => p.page));
  const cardChunks = chunkPages(pdf.pages, CARD_CHUNK_CHARS, MAX_CARD_CHUNKS);
  const summaryParts = chunkPages(pdf.pages, SUMMARY_CHUNK_CHARS, MAX_SUMMARY_PARTS);
  const targets = itemTargets(pdf);

  // A fatal error (bad key, no credits) in one call cancels the rest.
  const stop = new AbortController();
  const callSignal = AbortSignal.any([signal, stop.signal]);
  const usages: ModelUsage[] = [];
  const total = cardChunks.length + summaryParts.length;
  let done = 0;

  emit({ type: "stage", message: `Read ${pdf.pages.length} pages of text. Writing flashcards, MCQs and summary…` });
  emit({ type: "progress", done, total });

  const track = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } catch (err) {
      if (err instanceof FatalModelError) stop.abort();
      throw err;
    } finally {
      done += 1;
      if (!signal.aborted) emit({ type: "progress", done, total });
    }
  };

  const cardJobs = cardChunks.map((chunk) =>
    track(
      callModelJson({
        label: `cards p${chunk.first}-${chunk.last}`,
        system: CARDS_SYSTEM,
        user: cardsUserPrompt({
          fileName,
          first: chunk.first,
          last: chunk.last,
          pageCount: pdf.pageCount,
          flashcards: share(targets.flashcards, chunk, pdf.totalChars, 2),
          mcqs: share(targets.mcqs, chunk, pdf.totalChars, 1),
          slides: formatPages(chunk.pages),
        }),
        schemaName: "study_items",
        schema: CARDS_SCHEMA,
        maxTokens: 8_000,
        signal: callSignal,
      }).then((r) => {
        usages.push(r.usage ?? {});
        return normalizeCards(r.data, allowedPages);
      }),
    ),
  );

  const summaryJobs = summaryParts.map((part, i) =>
    track(
      callModelJson({
        label: `summary p${part.first}-${part.last}`,
        system: SUMMARY_SYSTEM,
        user: summaryUserPrompt({
          fileName,
          first: part.first,
          last: part.last,
          pageCount: pdf.pageCount,
          part: i + 1,
          parts: summaryParts.length,
          slides: formatPages(part.pages),
        }),
        schemaName: "unit_summary",
        schema: SUMMARY_SCHEMA,
        maxTokens: 10_000,
        signal: callSignal,
      }).then((r) => {
        usages.push(r.usage ?? {});
        return normalizeSummary(r.data, allowedPages);
      }),
    ),
  );

  const [cardResults, summaryResults] = await Promise.all([
    Promise.allSettled(cardJobs),
    Promise.allSettled(summaryJobs),
  ]);
  if (signal.aborted) throw new Error("Cancelled.");

  const failures = [...cardResults, ...summaryResults].filter((r) => r.status === "rejected");
  const fatal = failures.find((r) => r.reason instanceof FatalModelError);
  if (fatal) throw fatal.reason;
  if (failures.length === total) throw failures[0].reason;

  const warnings: string[] = [];
  const skippedPages = pdf.pageCount - pdf.pages.length;
  if (skippedPages > 0) {
    warnings.push(
      `${skippedPages} page${skippedPages === 1 ? " had" : "s had"} no readable text (images or diagrams only) and ${skippedPages === 1 ? "was" : "were"} skipped.`,
    );
  }

  const cardItems = cardResults.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    const c = cardChunks[i];
    warnings.push(`Flashcards and MCQs for pages ${c.first}–${c.last} couldn't be generated. Upload again to retry.`);
    return [];
  });
  const summaryItems = summaryResults.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    const p = summaryParts[i];
    warnings.push(`The summary is missing pages ${p.first}–${p.last}. Upload again to retry.`);
    return [];
  });

  const flashcards = dedupeFlashcards(cardItems.flatMap((r) => r.flashcards)).map((card, i) => ({
    id: `f${i + 1}`,
    ...card,
  }));
  const mcqs = cardItems.flatMap((r) => r.mcqs).map((q, i) => ({ id: `q${i + 1}`, ...q }));
  const summary = mergeSections(summaryItems.flatMap((r) => r.sections));

  if (flashcards.length === 0 && mcqs.length === 0 && summary.length === 0) {
    throw new Error("The model returned nothing usable for this PDF. Try again, or try a different file.");
  }

  logRun(fileName, pdf, flashcards, mcqs, summary.length, usages, `${provider.id}:${model}`);

  return {
    version: STUDY_SET_VERSION,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    title: summaryItems.find((s) => s.title)?.title || fileName.replace(/\.pdf$/i, ""),
    source: { fileName, pageCount: pdf.pageCount, textPages: pdf.pages.length },
    model,
    provider: provider.id,
    summary,
    flashcards,
    mcqs,
    warnings,
  };
}

/**
 * How many items the whole unit should get. Flashcards scale with the amount
 * of text, with a per-page floor so sparse slide decks still get decent
 * coverage. MCQs are about a third of that, but at least 12 once a deck has
 * 10 pages of text: the model tends to land at or a little under the target,
 * and a short unit still needs a real quiz. A 33-page deck gets about 20
 * flashcards and 12 MCQs; a 70-page deck roughly 40-80 and 14-27.
 */
function itemTargets(pdf: ExtractedPdf) {
  const pages = pdf.pages.length;
  const flashcards = clamp(Math.round(Math.max(pdf.totalChars / 650, pages * 0.6)), 8, 90);
  return {
    flashcards,
    mcqs: clamp(Math.round(flashcards / 3), pages >= 10 ? 12 : 4, 30),
  };
}

function share(total: number, chunk: PageChunk, totalChars: number, min: number): number {
  return Math.max(min, Math.round((total * chunk.chars) / totalChars));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Server-console stats to help judge a run. Never logs slide content. */
function logRun(
  fileName: string,
  pdf: ExtractedPdf,
  flashcards: StudySet["flashcards"],
  mcqs: StudySet["mcqs"],
  sections: number,
  usages: ModelUsage[],
  modelName: string,
) {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const longFronts = flashcards.filter((c) => words(c.front) > 15).length;
  const longBacks = flashcards.filter((c) => words(c.back) > 30).length;
  const cost = usages.reduce((n, u) => n + (u.cost ?? 0), 0);
  console.log(
    `[kube] "${fileName}": ${pdf.pageCount} pages (${pdf.totalChars} chars) -> ` +
      `${flashcards.length} flashcards (${longFronts} long fronts, ${longBacks} long backs), ` +
      `${mcqs.length} MCQs, ${sections} summary sections, ${modelName}` +
      (cost > 0 ? `, ~$${cost.toFixed(3)}` : ""),
  );
}
