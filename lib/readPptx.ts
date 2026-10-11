// Runs in the browser, like lib/readPdf.ts: reads the text of every slide of
// a PowerPoint file so only the text is sent to the server, never the file.
// A .pptx is a zip of XML parts; only the slide XML (and SmartArt text) is
// decompressed, never the images and media, so even large decks read fast.

import { strFromU8, unzipSync } from "fflate";

export class PptxReadError extends Error {}

// The only parts read: slide order, the slides, their links, and SmartArt text.
const NEEDED_PART = /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/(_rels\/)?slide\d+\.xml(\.rels)?|diagrams\/data\d+\.xml)$/;

/** Raw text of each shown slide, in slideshow order. Cleanup happens on the server (lib/pdf.ts). */
export async function readPptxText(file: File): Promise<string[]> {
  let parts: Record<string, string>;
  try {
    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => NEEDED_PART.test(entry.name),
    });
    parts = Object.fromEntries(Object.entries(zip).map(([name, data]) => [name, strFromU8(data)]));
  } catch {
    throw new PptxReadError(
      "Couldn't open this file as a PowerPoint (.pptx). If it's password-protected, remove the password; if it's damaged, export it as PDF and upload that.",
    );
  }
  const slides = pptxSlideTexts(parts);
  if (slides.length === 0) throw new PptxReadError("Couldn't find any slides in this PowerPoint file.");
  return slides;
}

/**
 * The text of each slide, given the file's XML parts by path. Hidden slides
 * are left out, like PowerPoint's own "Save as PDF", so slide n here is page
 * n of the exported PDF. On each slide the title comes first, then the other
 * text boxes, tables and SmartArt in the order PowerPoint stores them.
 * Slide-number, footer and date boxes are skipped.
 */
export function pptxSlideTexts(parts: Record<string, string>): string[] {
  const texts: string[] = [];
  for (const path of slidePaths(parts)) {
    const xml = parts[path];
    if (!xml || /<p:sld\b[^>]*\bshow="(0|false)"/.test(xml)) continue;
    texts.push(slideText(xml, path, parts));
  }
  return texts;
}

// Slide order comes from presentation.xml (<p:sldIdLst>), whose r:ids point at
// slide parts through presentation.xml.rels. Without it, use slideN.xml order.
function slidePaths(parts: Record<string, string>): string[] {
  const presentation = parts["ppt/presentation.xml"];
  const rels = relationships(parts, "ppt/presentation.xml");
  if (presentation && rels.size > 0) {
    const ordered = [...presentation.matchAll(/<p:sldId\b[^>]*?\br:id="([^"]+)"/g)]
      .map(([, id]) => rels.get(id))
      .filter((path): path is string => !!path);
    if (ordered.length > 0) return ordered;
  }
  const number = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return Object.keys(parts)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => number(a) - number(b));
}

/** Relationship id -> resolved part path, from the part's _rels file. */
function relationships(parts: Record<string, string>, partPath: string): Map<string, string> {
  const dir = partPath.slice(0, partPath.lastIndexOf("/") + 1);
  const file = partPath.slice(dir.length);
  const xml = parts[`${dir}_rels/${file}.rels`] ?? "";
  const map = new Map<string, string>();
  for (const [tag] of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attribute(tag, "Id");
    const target = attribute(tag, "Target");
    if (id && target && attribute(tag, "TargetMode") !== "External") map.set(id, resolvePath(dir, target));
  }
  return map;
}

function resolvePath(dir: string, target: string): string {
  const segments = (target.startsWith("/") ? target.slice(1) : dir + target).split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "..") out.pop();
    else if (segment && segment !== ".") out.push(segment);
  }
  return out.join("/");
}

function slideText(xml: string, path: string, parts: Record<string, string>): string {
  // Alternate renderings (e.g. an equation's fallback picture) would repeat text.
  const body = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "");
  const rels = relationships(parts, path);
  const titles: string[] = [];
  const rest: string[] = [];

  for (const [shape] of body.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>|<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)) {
    if (shape.startsWith("<p:graphicFrame")) {
      rest.push(...tableLines(shape));
      const dataId = shape.match(/<dgm:relIds\b[^>]*\br:dm="([^"]+)"/)?.[1];
      const dataPath = dataId ? rels.get(dataId) : undefined;
      if (dataPath && parts[dataPath]) rest.push(...smartArtLines(parts[dataPath]));
      continue;
    }
    const type = shape.match(/<p:ph\b[^>]*\btype="(\w+)"/)?.[1];
    if (type === "sldNum" || type === "ftr" || type === "dt") continue;
    (type === "title" || type === "ctrTitle" ? titles : rest).push(...paragraphLines(shape));
  }
  return [...titles, ...rest].join("\n");
}

/** One line per non-empty paragraph; <a:br/> line breaks become new lines too. */
function paragraphLines(xml: string): string[] {
  const lines: string[] = [];
  for (const [, inner] of xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)) {
    let text = "";
    for (const [token, run] of inner.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) {
      text += token.startsWith("<a:br") ? "\n" : decodeXml(run);
    }
    lines.push(...text.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean));
  }
  return lines;
}

/** A table becomes one line per row, cells joined with " | ". */
function tableLines(xml: string): string[] {
  const rows: string[] = [];
  for (const [row] of xml.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)) {
    const cells = [...row.matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map(([cell]) => paragraphLines(cell).join(" "));
    if (cells.some(Boolean)) rows.push(cells.join(" | "));
  }
  return rows;
}

/** SmartArt keeps its text in a separate data part, one point per node. */
function smartArtLines(xml: string): string[] {
  return [...xml.matchAll(/<dgm:t\b[^>]*>([\s\S]*?)<\/dgm:t>/g)].flatMap(([, inner]) => paragraphLines(inner));
}

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[lower] ?? "";
  });
}
