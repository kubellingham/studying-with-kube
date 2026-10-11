"use client";

import { useEffect } from "react";
import type { Progress } from "@/lib/storage";
import type { Mcq } from "@/lib/types";
import { Button, isTypingTarget, Kbd, PageRef, shortcutKey } from "./ui";

const LETTERS = ["A", "B", "C", "D"];

interface Props {
  mcqs: Mcq[];
  /** Question id -> chosen option index. An answer is final once chosen. */
  answers: Record<string, number>;
  index: number;
  onChange: (patch: Partial<Pick<Progress, "quizAnswers" | "quizIndex">>) => void;
}

export default function Quiz({ mcqs, answers, index, onChange }: Props) {
  const pos = Math.min(index, mcqs.length);
  const q = mcqs[pos] as Mcq | undefined;
  const chosen = q ? answers[q.id] : undefined;
  const answered = chosen !== undefined;

  const choose = (option: number) => {
    if (!q || answered) return;
    onChange({ quizAnswers: { ...answers, [q.id]: option } });
  };
  const goTo = (next: number) => onChange({ quizIndex: Math.max(0, Math.min(mcqs.length, next)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey || !q) return;
      // 1–4 or A–D pick an option (layout- and Num-Lock-independent, see shortcutKey).
      const key = shortcutKey(e);
      const option = "1234".includes(key) ? Number(key) - 1 : "abcd".indexOf(key);
      if (key.length === 1 && option >= 0 && option < q.options.length) {
        e.preventDefault();
        if (!e.repeat) choose(option);
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && answered) {
        e.preventDefault();
        goTo(pos + 1);
      } else if (e.key === "ArrowLeft") {
        goTo(pos - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (mcqs.length === 0) {
    return <p className="text-muted">No quiz questions were generated for these slides.</p>;
  }

  const answeredCount = mcqs.filter((m) => answers[m.id] !== undefined).length;
  const score = mcqs.filter((m) => answers[m.id] === m.answerIndex).length;

  if (!q) {
    return (
      <Results
        mcqs={mcqs}
        answers={answers}
        score={score}
        answeredCount={answeredCount}
        onRetake={() => onChange({ quizAnswers: {}, quizIndex: 0 })}
        onBack={() => goTo(mcqs.length - 1)}
      />
    );
  }

  const correct = answered && chosen === q.answerIndex;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium">
          Question {pos + 1} of {mcqs.length}
        </p>
        <p className="text-muted">
          Score {score}/{answeredCount}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(pos / mcqs.length) * 100}%` }} />
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted">{q.topic}</span>
          <PageRef pages={q.pages} />
        </div>
        <p className="mt-4 text-lg font-medium leading-snug sm:text-xl">{q.question}</p>

        <div className="mt-6 space-y-2">
          {q.options.map((option, i) => {
            const isAnswer = i === q.answerIndex;
            const isChosen = i === chosen;
            let tone = "border-line hover:border-accent hover:bg-accent-soft";
            if (answered) {
              if (isAnswer) tone = "border-good bg-good-soft";
              else if (isChosen) tone = "border-bad bg-bad-soft";
              else tone = "border-line opacity-60";
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                disabled={answered}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-default ${tone}`}
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-semibold ${
                    answered && isAnswer
                      ? "bg-good text-white dark:text-[#111114]"
                      : answered && isChosen
                        ? "bg-bad text-white dark:text-[#111114]"
                        : "bg-surface-2 text-muted"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                <span className="leading-snug">{option}</span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${correct ? "bg-good-soft" : "bg-bad-soft"}`} role="status">
            <p className={`font-semibold ${correct ? "text-good" : "text-bad"}`}>
              {correct ? "Correct." : `Not quite. The answer is ${LETTERS[q.answerIndex]}.`}
            </p>
            {q.why && <p className="mt-1 text-ink">{q.why}</p>}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => goTo(pos - 1)} disabled={pos === 0}>
          ← Back
        </Button>
        <p className="hidden text-xs text-muted sm:block">
          <Kbd>1</Kbd>–<Kbd>4</Kbd> or <Kbd>A</Kbd>–<Kbd>D</Kbd> answer · <Kbd>Enter</Kbd> next
        </p>
        <Button variant={answered ? "primary" : "secondary"} onClick={() => goTo(pos + 1)}>
          {pos === mcqs.length - 1 ? "See results" : answered ? "Next question →" : "Skip →"}
        </Button>
      </div>
    </div>
  );
}

function Results({
  mcqs,
  answers,
  score,
  answeredCount,
  onRetake,
  onBack,
}: {
  mcqs: Mcq[];
  answers: Record<string, number>;
  score: number;
  answeredCount: number;
  onRetake: () => void;
  onBack: () => void;
}) {
  const missed = mcqs.filter((m) => answers[m.id] !== m.answerIndex);
  const pct = mcqs.length ? Math.round((score / mcqs.length) * 100) : 0;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-sm text-muted">Your score</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">
          {score} / {mcqs.length}
        </p>
        <p className="mt-1 text-sm text-muted">
          {pct}%{answeredCount < mcqs.length ? ` · ${mcqs.length - answeredCount} skipped` : ""}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onRetake}>
            Retake quiz
          </Button>
          <Button variant="ghost" onClick={onBack}>
            ← Last question
          </Button>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">To go over ({missed.length})</h2>
          <ul className="mt-3 space-y-3">
            {missed.map((m) => {
              const chosen = answers[m.id];
              return (
                <li key={m.id} className="rounded-xl border border-line bg-surface p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{m.question}</p>
                    <PageRef pages={m.pages} />
                  </div>
                  {chosen !== undefined ? (
                    <p className="mt-2 text-bad">You said: {m.options[chosen]}</p>
                  ) : (
                    <p className="mt-2 text-muted">Skipped</p>
                  )}
                  <p className="mt-1 text-good">Answer: {m.options[m.answerIndex]}</p>
                  {m.why && <p className="mt-1 text-muted">{m.why}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
