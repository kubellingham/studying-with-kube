"use client";

import type { SlidePage } from "@/lib/pdf";
import type { Progress, Tab } from "@/lib/storage";
import type { StudySet } from "@/lib/types";
import CopyForReview from "./CopyForReview";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";
import ShareLink from "./ShareLink";
import Summary from "./Summary";

interface Props {
  set: StudySet;
  progress: Progress;
  onProgress: (patch: Partial<Progress>) => void;
  /** Extra notes shown with the set's own warnings. */
  notices?: string[];
  /** Slide text for "Copy for review", or null when this browser doesn't have it. */
  slides: SlidePage[] | null;
  /** Why the slide text is missing, written into the review payload when it is. */
  missingSlidesNote: string;
}

/** Title, warnings, share link and the three study modes. Used by the home page and /s/[id]. */
export default function StudyView({ set, progress, onProgress, notices = [], slides, missingSlidesNote }: Props) {
  const warnings = [...notices, ...set.warnings];
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "flashcards", label: "Flashcards", count: set.flashcards.length },
    { id: "quiz", label: "Quiz", count: set.mcqs.length },
    { id: "summary", label: "Summary" },
  ];

  return (
    <>
      <section className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{set.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {set.source.fileName} · {set.source.pageCount} pages · made {formatDate(set.createdAt)}
        </p>
        {/* One row of actions; their status line / share panel wrap onto full-width rows below. */}
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <CopyForReview set={set} slides={slides} missingSlidesNote={missingSlidesNote} />
          {set.shareId && <ShareLink shareId={set.shareId} />}
        </div>
        {warnings.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mt-6 flex gap-1 border-b border-line" aria-label="Study modes">
        {tabs.map((tab) => {
          const active = progress.tab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onProgress({ tab: tab.id })}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{tab.count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 flex-1">
        {progress.tab === "flashcards" && (
          <Flashcards
            cards={set.flashcards}
            marks={progress.cardMarks}
            index={progress.cardIndex}
            onIndex={(cardIndex) => onProgress({ cardIndex })}
            onMarks={(cardMarks) => onProgress({ cardMarks })}
          />
        )}
        {progress.tab === "quiz" && (
          <Quiz mcqs={set.mcqs} answers={progress.quizAnswers} index={progress.quizIndex} onChange={onProgress} />
        )}
        {progress.tab === "summary" && <Summary title={set.title} sections={set.summary} />}
      </div>
    </>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
