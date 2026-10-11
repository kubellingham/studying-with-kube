"use client";

import { useCallback, useRef, useState } from "react";
import { clearAll, emptyProgress, loadProgress, loadSet, saveProgress, saveSet, type Progress, type Tab } from "@/lib/storage";
import type { GenerateEvent, StudySet } from "@/lib/types";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";
import Summary from "./Summary";
import { Button } from "./ui";
import Uploader, { type GenerationState } from "./Uploader";

const MAX_UPLOAD_MB = 20;

export default function KubeApp() {
  // Rendered client-only (see ClientApp), so localStorage is available here.
  const [set, setSet] = useState<StudySet | null>(() => loadSet());
  const [progress, setProgress] = useState<Progress | null>(() => {
    const initial = loadSet();
    return initial ? loadProgress(initial) : null;
  });
  const [showUploader, setShowUploader] = useState(false);
  const [gen, setGen] = useState<GenerationState>({ status: "idle" });
  const [storageWarning, setStorageWarning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateProgress = useCallback((patch: Partial<Progress>) => {
    setProgress((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveProgress(next);
      return next;
    });
  }, []);

  const generate = useCallback(async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setGen({ status: "error", message: "That isn't a PDF. v1 only reads PDF lecture slides." });
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setGen({ status: "error", message: `That file is over ${MAX_UPLOAD_MB} MB. Upload one unit of slides at a time.` });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    setGen({ status: "working", fileName: file.name, message: "Uploading and reading your slides…", done: 0, total: 0, startedAt });

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/generate", { method: "POST", body, signal: controller.signal });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Upload failed (HTTP ${res.status}).`);
      }

      let result: StudySet | null = null;
      for await (const event of readEvents(res.body)) {
        if (event.type === "stage") {
          setGen((g) => (g.status === "working" ? { ...g, message: event.message } : g));
        } else if (event.type === "progress") {
          setGen((g) => (g.status === "working" ? { ...g, done: event.done, total: event.total } : g));
        } else if (event.type === "error") {
          throw new Error(event.message);
        } else if (event.type === "done") {
          result = event.set;
        }
      }
      if (!result) throw new Error("The connection closed before the set was finished. Try again.");

      const fresh = emptyProgress(result.id);
      setStorageWarning(!saveSet(result));
      saveProgress(fresh);
      setSet(result);
      setProgress(fresh);
      setShowUploader(false);
      setGen({ status: "idle" });
    } catch (err) {
      if (controller.signal.aborted) {
        setGen({ status: "idle" });
      } else {
        setGen({ status: "error", message: (err as Error).message || "Something went wrong. Try again." });
      }
    } finally {
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    if (!window.confirm("Delete this study set and your progress from this browser?")) return;
    clearAll();
    setSet(null);
    setProgress(null);
    setShowUploader(false);
    setStorageWarning(false);
    setGen({ status: "idle" });
  }, []);

  const uploader = (
    <Uploader
      state={gen}
      onFile={generate}
      onCancel={cancel}
      onDismissError={() => setGen({ status: "idle" })}
      replacing={!!set}
      onClose={set ? () => setShowUploader(false) : undefined}
    />
  );

  if (!set || !progress) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:py-16">
        <Brand />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">Upload a unit of lecture slides</h1>
        <p className="mt-3 text-muted">
          You&apos;ll get flashcards, a practice quiz and a short summary, built only from what&apos;s in the PDF.
        </p>
        <div className="mt-8">{uploader}</div>
      </main>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "flashcards", label: "Flashcards", count: set.flashcards.length },
    { id: "quiz", label: "Quiz", count: set.mcqs.length },
    { id: "summary", label: "Summary" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <div className="flex gap-2">
          <Button onClick={() => setShowUploader((v) => !v)} disabled={gen.status === "working"}>
            New PDF
          </Button>
          <Button variant="ghost" onClick={reset} disabled={gen.status === "working"}>
            Reset
          </Button>
        </div>
      </header>

      {(showUploader || gen.status !== "idle") && <div className="mt-6">{uploader}</div>}

      <section className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{set.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {set.source.fileName} · {set.source.pageCount} pages · made {formatDate(set.createdAt)}
        </p>
        {(set.warnings.length > 0 || storageWarning) && (
          <ul className="mt-4 space-y-1 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink">
            {storageWarning && (
              <li>This browser wouldn&apos;t save the set, so it will be gone if you close the tab.</li>
            )}
            {set.warnings.map((w) => (
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
              onClick={() => updateProgress({ tab: tab.id })}
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
            onIndex={(cardIndex) => updateProgress({ cardIndex })}
            onMarks={(cardMarks) => updateProgress({ cardMarks })}
          />
        )}
        {progress.tab === "quiz" && (
          <Quiz
            mcqs={set.mcqs}
            answers={progress.quizAnswers}
            index={progress.quizIndex}
            onChange={(patch) => updateProgress(patch)}
          />
        )}
        {progress.tab === "summary" && <Summary title={set.title} sections={set.summary} />}
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white dark:text-[#111114]" aria-hidden>
        K
      </span>
      StudyingKube
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Parses the newline-delimited JSON stream from /api/generate. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<GenerateEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as GenerateEvent;
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as GenerateEvent;
}
