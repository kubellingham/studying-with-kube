import type { SummarySection } from "@/lib/types";
import { PageRef, RichText } from "./ui";

export default function Summary({ title, sections }: { title: string; sections: SummarySection[] }) {
  if (sections.length === 0) {
    return <p className="text-muted">No summary was generated for this PDF.</p>;
  }

  return (
    <div className="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10">
      <nav className="hidden lg:block" aria-label="Topics">
        <div className="sticky top-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Topics</p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={i}>
                <a href={`#topic-${i + 1}`} className="block leading-snug text-muted hover:text-ink">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="max-w-2xl">
        <p className="text-sm text-muted">
          {sections.length} topics · {title}
        </p>
        <div className="mt-4 space-y-4">
          {sections.map((section, i) => (
            <section
              key={i}
              id={`topic-${i + 1}`}
              className="scroll-mt-6 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-7"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold leading-snug tracking-tight">
                  <span className="mr-2 font-mono text-sm text-muted">{i + 1}.</span>
                  {section.heading}
                </h2>
                <PageRef pages={section.pages} asRange />
              </div>
              <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink/90">
                {section.points.map((point, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span>
                      <RichText text={point} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
