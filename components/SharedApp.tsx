"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { loadProgress, saveProgress, SHARED_PROGRESS_KEY, type Progress } from "@/lib/storage";
import type { StudySet } from "@/lib/types";
import StudyView from "./StudyView";
import { Brand } from "./ui";

/**
 * A set opened from its share link. Read-only: the stored copy never changes.
 * The viewer's own progress lives in their browser, separate from the home
 * page's set, so opening a link never replaces what they have at "/".
 */
export default function SharedApp({ set }: { set: StudySet }) {
  // Rendered client-only (see SharedClient), so localStorage is available here.
  const [progress, setProgress] = useState<Progress>(() => loadProgress(set, SHARED_PROGRESS_KEY));

  const updateProgress = useCallback((patch: Partial<Progress>) => {
    setProgress((prev) => {
      const next = { ...prev, ...patch };
      saveProgress(next, SHARED_PROGRESS_KEY);
      return next;
    });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Brand />
          <span className="whitespace-nowrap rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">Shared set</span>
        </div>
        <Link
          href="/"
          className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <span className="sm:hidden">Upload</span>
          <span className="hidden sm:inline">Upload your own</span>
        </Link>
      </header>
      <StudyView
        set={set}
        progress={progress}
        onProgress={updateProgress}
        slides={null}
        missingSlidesNote="This set was opened from a share link, and share links don't carry the slide text. Use Copy for review on the device that generated the set to include it."
      />
    </main>
  );
}
