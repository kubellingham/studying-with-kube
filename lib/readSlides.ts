// Runs in the browser. Picks the reader for an uploaded slides file (PDF or
// PowerPoint). Either way only the text of each page or slide is sent to the
// server, never the file.

import { readPdfText } from "./readPdf";

type SlidesKind = "pdf" | "pptx";

const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** The file picker's `accept` list. */
export const SLIDES_ACCEPT = `application/pdf,.pdf,${PPTX_TYPE},.pptx`;

// A .pptx carries its images inside, so the same slides weigh far more than as
// a PDF; only its XML is ever decompressed (lib/readPptx.ts), so a higher cap is cheap.
const MAX_MB: Record<SlidesKind, number> = { pdf: 20, pptx: 100 };

function slidesKind(file: File): SlidesKind | null {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return "pdf";
  if (/\.pptx$/i.test(file.name) || file.type === PPTX_TYPE) return "pptx";
  return null;
}

/** A message for the user if this file can't be used, or null if it's fine. */
export function checkSlidesFile(file: File): string | null {
  const kind = slidesKind(file);
  if (!kind) {
    return /\.ppt$/i.test(file.name)
      ? "Old .ppt files can't be read. Open it in PowerPoint, save it as .pptx or PDF, and upload that."
      : "That isn't a PDF or PowerPoint file. Kube reads lecture slides as .pdf or .pptx.";
  }
  if (file.size > MAX_MB[kind] * 1024 * 1024) {
    return `That file is over ${MAX_MB[kind]} MB. Upload one unit of slides at a time.`;
  }
  return null;
}

/** Raw text of each PDF page or shown PowerPoint slide, in order. */
export async function readSlidesText(file: File): Promise<string[]> {
  if (slidesKind(file) === "pptx") {
    const { readPptxText } = await import("./readPptx");
    return readPptxText(file);
  }
  return readPdfText(file);
}
