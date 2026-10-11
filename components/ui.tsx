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
    <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted" title="Page in your PDF">
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

/** True when a key press should be ignored by page-level shortcuts. */
export function isTypingTarget(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
