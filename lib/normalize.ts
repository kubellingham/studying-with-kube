// Turns whatever the model returned into clean, valid items. Lenient by
// design: one malformed card is dropped, it doesn't fail the whole set.

import type { Flashcard, Mcq, SummarySection } from "./types";

type Draft<T> = Omit<T, "id">;

function cleanText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > maxChars) return null;
  return text;
}

/** Topic badge text: the slide's list numbering ("2. Heterogeneity") is noise in the UI. */
function cleanTopic(value: unknown): string {
  return (cleanText(value, 120) ?? "").replace(/(^|:\s)\d{1,2}[.)]\s+/, "$1");
}

function cleanPages(value: unknown, allowed: Set<number>): number[] {
  if (!Array.isArray(value)) return [];
  const pages = value
    .map((v) => (typeof v === "string" ? Number.parseInt(v, 10) : v))
    .filter((v): v is number => Number.isInteger(v) && allowed.has(v));
  return [...new Set(pages)].sort((a, b) => a - b).slice(0, 8);
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : [];
}

const REFERS_TO_OTHER_OPTIONS = /\b(all|none|both|neither) of the (above|these|options)\b|\bboth [a-d] and [a-d]\b|\boption [a-d]\b/i;

export function normalizeCards(
  data: unknown,
  allowedPages: Set<number>,
): { flashcards: Draft<Flashcard>[]; mcqs: Draft<Mcq>[] } {
  const root = (data ?? {}) as Record<string, unknown>;

  const flashcards: Draft<Flashcard>[] = [];
  for (const item of list(root.flashcards)) {
    const front = cleanText(item.front, 300);
    const back = cleanText(item.back, 400);
    if (!front || !back) continue;
    flashcards.push({
      topic: cleanTopic(item.topic),
      front,
      back,
      pages: cleanPages(item.pages, allowedPages),
    });
  }

  const mcqs: Draft<Mcq>[] = [];
  for (const item of list(root.mcqs)) {
    const question = cleanText(item.question, 400);
    const correct = cleanText(item.correct, 250);
    const distractors = Array.isArray(item.distractors)
      ? item.distractors.map((d) => cleanText(d, 250)).filter((d): d is string => d !== null)
      : [];
    if (!question || !correct || distractors.length < 3) continue;

    const options = [correct, ...distractors.slice(0, 3)];
    const distinct = new Set(options.map((o) => o.toLowerCase()));
    if (distinct.size !== 4 || options.some((o) => REFERS_TO_OTHER_OPTIONS.test(o))) continue;

    // Models favour certain answer positions; shuffle so the answer isn't guessable.
    const order = shuffle([0, 1, 2, 3]);
    mcqs.push({
      topic: cleanTopic(item.topic),
      question,
      options: order.map((i) => options[i]),
      answerIndex: order.indexOf(0),
      why: cleanText(item.why, 400) ?? "",
      pages: cleanPages(item.pages, allowedPages),
    });
  }

  return { flashcards, mcqs };
}

export function normalizeSummary(
  data: unknown,
  allowedPages: Set<number>,
): { title: string; sections: SummarySection[] } {
  const root = (data ?? {}) as Record<string, unknown>;
  const sections: SummarySection[] = [];
  for (const item of list(root.sections)) {
    const heading = cleanText(item.heading, 160);
    const points = Array.isArray(item.points)
      ? item.points.map((p) => cleanText(p, 500)).filter((p): p is string => p !== null)
      : [];
    if (!heading || points.length === 0) continue;
    sections.push({ heading, points, pages: cleanPages(item.pages, allowedPages) });
  }
  return { title: cleanText(root.title, 160) ?? "", sections };
}

/**
 * Joins summary parts written separately. When a topic straddles a part
 * boundary both parts may emit the same heading; those get merged.
 */
export function mergeSections(sections: SummarySection[]): SummarySection[] {
  const merged: SummarySection[] = [];
  for (const section of sections) {
    const prev = merged[merged.length - 1];
    if (prev && headingKey(prev.heading) === headingKey(section.heading)) {
      prev.points.push(...section.points);
      prev.pages = [...new Set([...prev.pages, ...section.pages])].sort((a, b) => a - b);
    } else {
      merged.push({ ...section, points: [...section.points], pages: [...section.pages] });
    }
  }
  return merged;
}

function headingKey(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/\(?\b(contd|cont|continued)\b\.?\)?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Drops cards whose question is the same as an earlier card's (chunks can overlap in topic). */
export function dedupeFlashcards<T extends { front: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
