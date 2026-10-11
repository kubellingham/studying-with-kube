"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";

/** "Share this set" button that reveals the set's /s/<id> URL with a copy button. */
export default function ShareLink({ shareId }: { shareId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = `${window.location.origin}/s/${shareId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context): select the text so it can be copied by hand.
      inputRef.current?.select();
    }
  };

  return (
    <div className="w-full sm:w-auto">
      <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Share this set
      </Button>
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3 sm:w-96">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Share link"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs"
            />
            <Button variant="primary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Opens this exact set on any device, after the access password. Progress stays on each device.
          </p>
        </div>
      )}
    </div>
  );
}
