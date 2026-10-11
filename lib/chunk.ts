import type { SlidePage } from "./pdf";

export interface PageChunk {
  pages: SlidePage[];
  first: number;
  last: number;
  chars: number;
}

/**
 * Splits pages into contiguous runs of roughly equal text length. Each run is
 * sent to the model separately (in parallel), which keeps every call short and
 * forces coverage of the middle and end of the unit, not just the start.
 */
export function chunkPages(pages: SlidePage[], targetChars: number, maxChunks: number): PageChunk[] {
  if (pages.length === 0) return [];
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  const count = Math.max(1, Math.min(maxChunks, pages.length, Math.ceil(total / targetChars)));
  const perChunk = total / count;

  const chunks: PageChunk[] = [];
  let current: SlidePage[] = [];
  let consumed = 0;

  const close = () => {
    if (current.length === 0) return;
    chunks.push({
      pages: current,
      first: current[0].page,
      last: current[current.length - 1].page,
      chars: current.reduce((n, p) => n + p.text.length, 0),
    });
    current = [];
  };

  for (const page of pages) {
    current.push(page);
    consumed += page.text.length;
    // Close on cumulative boundaries so rounding doesn't pile up in the last chunk.
    if (chunks.length < count - 1 && consumed >= perChunk * (chunks.length + 1)) close();
  }
  close();
  return chunks;
}

/** The text block the model sees: every page tagged so it can cite page numbers. */
export function formatPages(pages: SlidePage[]): string {
  return pages.map((p) => `[[PAGE ${p.page}]]\n${p.text}`).join("\n\n");
}
