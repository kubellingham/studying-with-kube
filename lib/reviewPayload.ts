// Builds the "Copy for review" text: the whole generated set plus the slide
// text the model saw, as plain Markdown that can be pasted into a chat with a
// reviewer (human + model) to check coverage, grounding and card quality.
// Runs in the browser; nothing here touches the server or a model.

import { formatPages } from "./chunk";
import type { SlidePage } from "./pdf";
import type { StudySet } from "./types";

const PROVIDER_LABELS: Record<string, string> = { openrouter: "OpenRouter", aimlapi: "AI/ML API" };

export function buildReviewPayload(set: StudySet, slides: SlidePage[] | null, missingSlidesNote: string): string {
  const out: string[] = [];
  const line = (text = "") => out.push(text);
  const provider = set.provider ? ` via ${PROVIDER_LABELS[set.provider] ?? set.provider}` : "";

  line(`# StudyingKube set for review: ${set.title}`);
  line();
  line(`- File: ${set.source.fileName} (${set.source.pageCount} pages, ${set.source.textPages} with text)`);
  line(`- Model: ${set.model}${provider}`);
  line(`- Generated: ${utc(set.createdAt)}`);
  line(`- Contents: ${set.flashcards.length} flashcards, ${set.mcqs.length} MCQs, ${set.summary.length} summary sections`);
  for (const warning of set.warnings) line(`- Warning: ${warning}`);
  line(
    slides
      ? "- Slide text: included at the end, exactly as the model saw it. Items cite pages as p.N; check each against its [[PAGE N]] block."
      : `- Slide text: NOT included. ${missingSlidesNote}`,
  );

  line();
  line(`## Flashcards (${set.flashcards.length})`);
  set.flashcards.forEach((card, i) => {
    line();
    line(`F${i + 1} · ${card.topic || "(no topic)"} · ${pages(card.pages)}`);
    line(`Q: ${card.front}`);
    line(`A: ${card.back}`);
  });

  line();
  line(`## MCQs (${set.mcqs.length})`);
  set.mcqs.forEach((q, i) => {
    line();
    line(`M${i + 1} · ${q.topic || "(no topic)"} · ${pages(q.pages)}`);
    line(`Q: ${q.question}`);
    line(`Correct: ${q.options[q.answerIndex]}`);
    line(`Wrong: ${q.options.filter((_, j) => j !== q.answerIndex).join(" | ")}`);
    if (q.why) line(`Why: ${q.why}`);
  });

  line();
  line(`## Summary (${set.summary.length} sections)`);
  set.summary.forEach((section, i) => {
    line();
    line(`### ${i + 1}. ${section.heading} · ${pages(section.pages)}`);
    for (const point of section.points) line(`- ${point}`);
  });

  if (slides) {
    line();
    line("## Slide text (what the model saw)");
    line();
    line(formatPages(slides));
  }

  return out.join("\n") + "\n";
}

/** "p.5", "pp.5–9" for a contiguous run, "pp.3, 7" otherwise, "no page cited" if empty. */
function pages(list: number[]): string {
  if (list.length === 0) return "no page cited";
  if (list.length === 1) return `p.${list[0]}`;
  const sorted = [...list].sort((a, b) => a - b);
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  return contiguous ? `pp.${sorted[0]}–${sorted[sorted.length - 1]}` : `pp.${sorted.join(", ")}`;
}

function utc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
