"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { SLIDES_ACCEPT } from "@/lib/readSlides";
import { Button } from "./ui";

export type GenerationState =
  | { status: "idle" }
  | { status: "working"; fileName: string; message: string; done: number; total: number; startedAt: number }
  | { status: "error"; message: string };

interface Props {
  state: GenerationState;
  onFile: (file: File) => void;
  onCancel: () => void;
  onDismissError: () => void;
  /** True when a set already exists and will be replaced. */
  replacing: boolean;
  onClose?: () => void;
}

export default function Uploader({ state, onFile, onCancel, onDismissError, replacing, onClose }: Props) {
  if (state.status === "working") return <Working state={state} onCancel={onCancel} />;

  return (
    <div className="space-y-3">
      {state.status === "error" && (
        <div className="flex items-start justify-between gap-4 rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">
          <p>{state.message}</p>
          <button type="button" className="shrink-0 font-medium underline" onClick={onDismissError}>
            Dismiss
          </button>
        </div>
      )}
      <DropZone onFile={onFile} replacing={replacing} onClose={onClose} />
    </div>
  );
}

function DropZone({ onFile, replacing, onClose }: { onFile: (f: File) => void; replacing: boolean; onClose?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
        dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"
      }`}
    >
      <p className="text-base font-medium">Drop your slides here</p>
      <p className="mt-1 text-sm text-muted">One unit at a time · PDF or PowerPoint (.pptx) with real text, not scans · up to 100 pages</p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Button variant="primary" onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )}
      </div>
      {replacing && (
        <p className="mt-4 text-xs text-muted">The new set replaces the current one once it&apos;s ready.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={SLIDES_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

function Working({
  state,
  onCancel,
}: {
  state: Extract<GenerationState, { status: "working" }>;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  // Reading/uploading counts as the first 10%; each finished model call fills the rest.
  const pct = state.total > 0 ? 10 + (90 * state.done) / state.total : Math.min(9, seconds * 2);

  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-8" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4">
        <p className="truncate font-medium">{state.fileName}</p>
        <p className="shrink-0 font-mono text-sm text-muted">{seconds}s</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted">
        {state.message}
        {state.total > 0 && ` (${state.done}/${state.total} parts done)`}
      </p>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-xs text-muted">Usually about 30 seconds. Keep this tab open.</p>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
