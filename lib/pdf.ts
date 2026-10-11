export interface SlidePage {
  /** 1-based page number in the PDF. */
  page: number;
  text: string;
}

export interface ExtractedPdf {
  pageCount: number;
  /** Only pages that still have text after cleaning. */
  pages: SlidePage[];
  totalChars: number;
}

/**
 * Takes the raw text of every page (extracted in the browser, see
 * lib/readPdf.ts) and strips the noise lecture slides repeat on every page
 * (university name, course code, slide numbers) so the model spends its
 * attention on content.
 */
export function cleanSlides(rawPageTexts: string[]): ExtractedPdf {
  const rawPages = rawPageTexts.map(splitLines);
  const boilerplate = findBoilerplate(rawPages);

  const pages: SlidePage[] = [];
  rawPages.forEach((lines, i) => {
    const kept = lines.filter((line) => !boilerplate.has(boilerplateKey(line)) && !isPageNumber(line));
    if (kept.length > 0) pages.push({ page: i + 1, text: kept.join("\n") });
  });

  return {
    pageCount: rawPageTexts.length,
    pages,
    totalChars: pages.reduce((n, p) => n + p.text.length, 0),
  };
}

function splitLines(pageText: string): string[] {
  return pageText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/** Digits are wildcarded so "LPU 12" and "LPU 13" count as the same footer. */
function boilerplateKey(line: string): string {
  return line.toLowerCase().replace(/\d+/g, "#");
}

function isPageNumber(line: string): boolean {
  return /^(page\s*)?\d{1,3}(\s*(\/|of)\s*\d{1,3})?$/i.test(line);
}

/** Short lines that appear on a large share of pages are headers/footers. */
function findBoilerplate(pages: string[][]): Set<string> {
  const found = new Set<string>();
  if (pages.length < 6) return found;

  const counts = new Map<string, number>();
  for (const lines of pages) {
    const seen = new Set(lines.filter((l) => l.length <= 80).map(boilerplateKey));
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(4, Math.ceil(pages.length * 0.4));
  for (const [key, count] of counts) {
    if (count >= threshold) found.add(key);
  }
  return found;
}
