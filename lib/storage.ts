// Browser persistence. One active set at a time, plus the student's progress
// through it. Both are versioned so a future format change can't crash the
// page on old data: anything unrecognised is simply discarded.

import { STUDY_SET_VERSION, type StudySet } from "./types";

const SET_KEY = "kube:v1:set";
const PROGRESS_KEY = "kube:v1:progress";
/** Progress on a set opened from a share link (/s/<id>), kept apart from the home page's. */
export const SHARED_PROGRESS_KEY = "kube:v1:shared-progress";

export type CardMark = "know" | "dont";
export type Tab = "flashcards" | "quiz" | "summary";

export interface Progress {
  setId: string;
  tab: Tab;
  cardIndex: number;
  cardMarks: Record<string, CardMark>;
  quizIndex: number;
  /** Question id -> chosen option index. */
  quizAnswers: Record<string, number>;
}

export function emptyProgress(setId: string): Progress {
  return { setId, tab: "flashcards", cardIndex: 0, cardMarks: {}, quizIndex: 0, quizAnswers: {} };
}

export function loadSet(): StudySet | null {
  const set = read<StudySet>(SET_KEY);
  if (
    !set ||
    set.version !== STUDY_SET_VERSION ||
    !Array.isArray(set.flashcards) ||
    !Array.isArray(set.mcqs) ||
    !Array.isArray(set.summary)
  ) {
    return null;
  }
  return set;
}

export function loadProgress(set: StudySet, key = PROGRESS_KEY): Progress {
  const saved = read<Progress>(key);
  if (!saved || saved.setId !== set.id) return emptyProgress(set.id);
  return { ...emptyProgress(set.id), ...saved };
}

/** Returns false if the browser refused to store it (e.g. storage full or disabled). */
export function saveSet(set: StudySet): boolean {
  return write(SET_KEY, set);
}

export function saveProgress(progress: Progress, key = PROGRESS_KEY): void {
  write(key, progress);
}

export function clearAll(): void {
  try {
    localStorage.removeItem(SET_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
