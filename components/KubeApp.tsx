"use client";

import { useCallback, useRef, useState } from "react";
import { cleanSlides, type SlidePage } from "@/lib/pdf";
import { readPdfText } from "@/lib/readPdf";
import {
  clearAll,
  emptyProgress,
  loadProgress,
  loadSet,
  loadSource,
  saveProgress,
  saveSet,
  saveSource,
  type Progress,
} from "@/lib/storage";
import type { GenerateEvent, GenerateRequest, StudySet } from "@/lib/types";
import StudyView from "./StudyView";
import { Brand, Button } from "./ui";
import Uploader, { type GenerationState } from "./Uploader";

const MAX_UPLOAD_MB = 20;

export default function KubeApp() {
  // Rendered client-only (see ClientApp), so localStorage is available here.
  const [set, setSet] = useState<StudySet | null>(() => loadSet());
  const [progress, setProgress] = useState<Progress | null>(() => {
    const initial = loadSet();
    return initial ? loadProgress(initial) : null;
  });
  // The cleaned slide text the model saw, kept for "Copy for review".
  const [slides, setSlides] = useState<SlidePage[] | null>(() => {
    const initial = loadSet();
    return initial ? loadSource(initial.id) : null;
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
    setGen({ status: "working", fileName: file.name, message: "Reading your slides…", done: 0, total: 0, startedAt });

    try {
      // Only the text leaves the device, not the PDF (see lib/readPdf.ts).
      const pages = await readPdfText(file);
      if (controller.signal.aborted) throw new Error("Cancelled.");
      setGen((g) => (g.status === "working" ? { ...g, message: "Sending the text to the AI…" } : g));
      const request: GenerateRequest = { fileName: file.name, pages };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
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
      // The same cleanup the server ran, so the review payload shows exactly what the model saw.
      const cleaned = cleanSlides(pages).pages;
      setStorageWarning(!saveSet(result));
      saveProgress(fresh);
      saveSource(result.id, cleaned);
      setSet(result);
      setProgress(fresh);
      setSlides(cleaned);
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
    setSlides(null);
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

      <StudyView
        set={set}
        progress={progress}
        onProgress={updateProgress}
        notices={storageWarning ? ["This browser wouldn't save the set, so it will be gone if you close the tab."] : []}
        slides={slides}
        missingSlidesNote="This browser doesn't have the slide text for this set (it was made before Copy for review existed). Upload the PDF again to include it."
      />
    </main>
  );
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
