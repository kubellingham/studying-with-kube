import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "good" | "bad";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:opacity-90 dark:text-[#111114]",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  good: "bg-good-soft text-good border border-transparent hover:border-good",
  bad: "bg-bad-soft text-bad border border-transparent hover:border-bad",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white dark:text-[#111114]" aria-hidden>
        K
      </span>
      StudyingKube
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

/** "p. 12", "pp. 12–14", or "pp. 3, 7, 9". */
export function pageLabel(pages: number[], asRange = false): string {
  if (pages.length === 0) return "";
  if (pages.length === 1) return `p. ${pages[0]}`;
  const sorted = [...pages].sort((a, b) => a - b);
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  if (asRange || contiguous) return `pp. ${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `pp. ${sorted.join(", ")}`;
}

export function PageRef({ pages, asRange }: { pages: number[]; asRange?: boolean }) {
  const label = pageLabel(pages, asRange);
  if (!label) return null;
  return (
    <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted" title="Page or slide number in your file">
      {label}
    </span>
  );
}

/** Renders **bold** spans; everything else is plain text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-ink">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * The key a shortcut should match, lowercased: "y", "2", "ArrowLeft"...
 * Digits and letters fall back to the physical key (e.code), so number
 * shortcuts work on any keyboard layout and on the numeric keypad even with
 * Num Lock off (where "1" arrives as "End").
 */
export function shortcutKey(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (/^[a-z0-9]$/.test(key)) return key;
  const physical = /^(?:Digit|Numpad)([0-9])$/.exec(event.code) ?? /^Key([A-Z])$/.exec(event.code);
  return physical ? physical[1].toLowerCase() : key;
}

/** True when a key press should be ignored by page-level shortcuts. */
export function isTypingTarget(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
