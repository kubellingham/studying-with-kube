"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardMark } from "@/lib/storage";
import type { Flashcard } from "@/lib/types";
import { Button, isTypingTarget, Kbd, PageRef, shortcutKey } from "./ui";

interface Props {
  cards: Flashcard[];
  marks: Record<string, CardMark>;
  /** Position in the full deck (persisted). */
  index: number;
  onIndex: (index: number) => void;
  onMarks: (marks: Record<string, CardMark>) => void;
}

export default function Flashcards({ cards, marks, index, onIndex, onMarks }: Props) {
  // When set, we're going back over a fixed list of cards (the "don't know" pile).
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const [reviewPos, setReviewPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // Brief "✓ Know it" / "✗ Don't know" badge, so a key press visibly registers
  // even though the deck immediately moves on to the next card.
  const [lastMark, setLastMark] = useState<{ value: CardMark; seq: number } | null>(null);
  const markTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const deck = useMemo(
    () => (reviewIds ? reviewIds.map((id) => byId.get(id)).filter((c): c is Flashcard => !!c) : cards),
    [reviewIds, byId, cards],
  );
  const pos = Math.min(reviewIds ? reviewPos : index, deck.length);
  const card = deck[pos] as Flashcard | undefined;

  const know = cards.filter((c) => marks[c.id] === "know").length;
  const dontIds = cards.filter((c) => marks[c.id] === "dont").map((c) => c.id);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(deck.length, next));
    setFlipped(false);
    if (reviewIds) setReviewPos(clamped);
    else onIndex(clamped);
  };

  const mark = (value: CardMark) => {
    if (!card) return;
    onMarks({ ...marks, [card.id]: value });
    goTo(pos + 1);
    setLastMark((prev) => ({ value, seq: (prev?.seq ?? 0) + 1 }));
    clearTimeout(markTimer.current);
    markTimer.current = setTimeout(() => setLastMark(null), 900);
  };

  const startReview = () => {
    setReviewIds(dontIds);
    setReviewPos(0);
    setFlipped(false);
  };

  const exitReview = () => {
    setReviewIds(null);
    setFlipped(false);
  };

  // Swipe-style keys: Space flips, ← / N / 1 = don't know, → / Y / 2 = know it.
  // Previous/Next stay on the buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey || !card) return;
      const key = shortcutKey(e);
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) setFlipped((f) => !f);
      } else if (e.key === "ArrowLeft" || key === "n" || key === "1") {
        e.preventDefault();
        if (!e.repeat) mark("dont");
      } else if (e.key === "ArrowRight" || key === "y" || key === "2") {
        e.preventDefault();
        if (!e.repeat) mark("know");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (cards.length === 0) {
    return <p className="text-muted">No flashcards were generated for this PDF.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium">
          {reviewIds ? "Reviewing don't-knows · " : ""}
          {card ? `Card ${pos + 1} of ${deck.length}` : `${deck.length} of ${deck.length} done`}
        </p>
        <div className="flex items-center gap-2 text-muted">
          <span className="rounded-full bg-good-soft px-2 py-0.5 text-good">Know {know}</span>
          <span className="rounded-full bg-bad-soft px-2 py-0.5 text-bad">Don&apos;t know {dontIds.length}</span>
          {reviewIds ? (
            <Button variant="ghost" className="px-2! py-1!" onClick={exitReview}>
              Back to all cards
            </Button>
          ) : (
            dontIds.length > 0 && (
              <Button variant="ghost" className="px-2! py-1!" onClick={startReview}>
                Review don&apos;t-knows
              </Button>
            )
          )}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(pos / deck.length) * 100}%` }} />
      </div>

      {card ? (
        <>
          <div className="flip relative mt-6">
            {lastMark && (
              <span
                key={lastMark.seq}
                aria-live="polite"
                className={`pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                  lastMark.value === "know" ? "bg-good text-white dark:text-[#111114]" : "bg-bad text-white dark:text-[#111114]"
                }`}
              >
                {lastMark.value === "know" ? "✓ Know it" : "✗ Don't know"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? "Show question" : "Show answer"}
              className={`flip-inner w-full text-left focus-visible:outline-none ${flipped ? "is-flipped" : ""}`}
            >
              <Face card={card} side="front" mark={marks[card.id]} hidden={flipped} />
              <Face card={card} side="back" mark={marks[card.id]} hidden={!flipped} />
            </button>
          </div>

          {/* Laid out like a swipe, matching the keys: don't know on the left, know it on the right. */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="bad" className="order-1" onClick={() => mark("dont")}>
              ← Don&apos;t know
            </Button>
            <Button className="order-3 sm:order-2" onClick={() => goTo(pos - 1)} disabled={pos === 0}>
              Previous
            </Button>
            <Button className="order-4 sm:order-3" onClick={() => goTo(pos + 1)}>
              Next
            </Button>
            <Button variant="good" className="order-2 sm:order-4" onClick={() => mark("know")}>
              Know it →
            </Button>
          </div>
          <p className="mt-4 hidden text-center text-xs text-muted sm:block">
            <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> don&apos;t know · <Kbd>→</Kbd> know it · also <Kbd>N</Kbd> / <Kbd>Y</Kbd> or{" "}
            <Kbd>1</Kbd> / <Kbd>2</Kbd>
          </p>
        </>
      ) : (
        <RoundDone
          total={cards.length}
          know={know}
          dont={dontIds.length}
          reviewing={!!reviewIds}
          onReviewDont={startReview}
          onRestart={() => {
            exitReview();
            onIndex(0);
          }}
          onClearMarks={() => onMarks({})}
          onBack={() => goTo(deck.length - 1)}
        />
      )}
    </div>
  );
}

function Face({
  card,
  side,
  mark,
  hidden,
}: {
  card: Flashcard;
  side: "front" | "back";
  mark?: CardMark;
  hidden: boolean;
}) {
  const isBack = side === "back";
  return (
    <div
      aria-hidden={hidden}
      className={`flip-face flex min-h-72 flex-col rounded-2xl border bg-surface p-6 shadow-sm sm:p-8 ${
        isBack ? "flip-back border-accent/40" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted">{card.topic}</span>
        <div className="flex shrink-0 items-center gap-2">
          {mark && (
            <span className={`text-xs ${mark === "know" ? "text-good" : "text-bad"}`}>
              {mark === "know" ? "✓ know" : "✗ don't know"}
            </span>
          )}
          <PageRef pages={card.pages} />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center py-6">
        {isBack ? (
          <>
            <p className="text-sm text-muted">{card.front}</p>
            <p className="mt-3 text-xl font-medium leading-snug sm:text-2xl">{card.back}</p>
          </>
        ) : (
          <p className="text-xl font-medium leading-snug sm:text-2xl">{card.front}</p>
        )}
      </div>
      <p className="text-xs text-muted">{isBack ? "Did you know it?" : "Tap the card to see the answer"}</p>
    </div>
  );
}

function RoundDone(props: {
  total: number;
  know: number;
  dont: number;
  reviewing: boolean;
  onReviewDont: () => void;
  onRestart: () => void;
  onClearMarks: () => void;
  onBack: () => void;
}) {
  const unmarked = props.total - props.know - props.dont;
  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-8 text-center">
      <p className="text-lg font-semibold">{props.reviewing ? "Review round done" : "You've been through every card"}</p>
      <p className="mt-2 text-sm text-muted">
        Know {props.know} · Don&apos;t know {props.dont} · Not marked {unmarked}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {props.dont > 0 && (
          <Button variant="primary" onClick={props.onReviewDont}>
            Review the {props.dont} I don&apos;t know
          </Button>
        )}
        <Button onClick={props.onRestart}>Go through all cards again</Button>
        <Button variant="ghost" onClick={props.onBack}>
          ← Last card
        </Button>
        {(props.know > 0 || props.dont > 0) && (
          <Button variant="ghost" onClick={props.onClearMarks}>
            Clear marks
          </Button>
        )}
      </div>
    </div>
  );
}
