// The JSON contract shared by the server (which builds a StudySet) and the
// browser (which renders it and keeps it in localStorage).

export const STUDY_SET_VERSION = 1;

export interface Flashcard {
  id: string;
  topic: string;
  front: string;
  back: string;
  /** 1-based PDF page numbers the card is based on. */
  pages: number[];
}

export interface Mcq {
  id: string;
  topic: string;
  question: string;
  /** Always 4 options, already shuffled. */
  options: string[];
  answerIndex: number;
  why: string;
  pages: number[];
}

export interface SummarySection {
  heading: string;
  pages: number[];
  /** Bullet points. May contain **bold** key terms; nothing else is markdown. */
  points: string[];
}

export interface StudySet {
  version: typeof STUDY_SET_VERSION;
  id: string;
  createdAt: string;
  title: string;
  source: {
    fileName: string;
    pageCount: number;
    /** Pages that had readable text (image-only pages are skipped). */
    textPages: number;
  };
  model: string;
  summary: SummarySection[];
  flashcards: Flashcard[];
  mcqs: Mcq[];
  /** Human-readable notes about partial failures, shown above the study UI. */
  warnings: string[];
}

/** Events streamed by POST /api/generate, one JSON object per line. */
export type GenerateEvent =
  | { type: "stage"; message: string }
  | { type: "progress"; done: number; total: number }
  | { type: "done"; set: StudySet }
  | { type: "error"; message: string };
