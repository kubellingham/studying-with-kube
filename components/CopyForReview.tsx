"use client";

import { useRef, useState } from "react";
import type { SlidePage } from "@/lib/pdf";
import { buildReviewPayload } from "@/lib/reviewPayload";
import type { StudySet } from "@/lib/types";
import { Button } from "./ui";

interface Props {
  set: StudySet;
  /** The slide text the model saw, or null when this browser doesn't have it. */
  slides: SlidePage[] | null;
  /** Why the slide text is missing, written into the payload when it is. */
  missingSlidesNote: string;
}

/** Copies the set + slide text as Markdown for a review chat. No server, no model calls. */
export default function CopyForReview({ set, slides, missingSlidesNote }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = async () => {
    const text = buildReviewPayload(set, slides, missingSlidesNote);
    const ok = await copyText(text);
    const size = `${Math.max(1, Math.round(new Blob([text]).size / 1024))} KB`;
    setStatus(
      !ok
        ? "Your browser blocked the clipboard. Try again, or use a different browser."
        : slides
          ? `Copied (${size}). Paste it into your reviewer.`
          : `Copied without the slide text (${size}). Paste it into your reviewer.`,
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 5000);
  };

  // Rendered inside StudyView's wrapping button row: the status line takes a
  // full row of its own under the buttons instead of widening this one.
  return (
    <>
      <Button onClick={copy}>Copy for review</Button>
      {status && (
        <p className="order-last basis-full text-xs text-muted" role="status">
          {status}
        </p>
      )}
    </>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older or locked-down browsers: fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
