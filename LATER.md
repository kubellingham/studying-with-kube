# Later

Ideas that came up while building v1 and were deliberately not built, because they're outside the v1 brief. One line each. Whether any of them happen is Prince's call.

## Engine quality (most relevant if v1's output falls short)

- Grounding check: a second, cheap model pass that checks each card against the page it cites and drops anything the page doesn't support.
- "Show me the slide text" on any card or question, to check grounding without opening the PDF.
- Thumbs up/down on individual cards and questions, to collect real quality data from testers.
- A small evaluation set (a few real LPU PDFs plus a scoring checklist) to compare models and prompt changes side by side.
- Read diagrams and image-only slides with a vision model instead of skipping them.
- Smarter dedupe across chunks (meaning-based, not just identical question text).
- Prompt caching, or calling Anthropic directly, to cut cost once the model is settled.
- Show cards as soon as the first chunk finishes, instead of waiting for the whole set.

- If AI/ML API returns malformed JSON often: call its native Anthropic endpoint (`/v1/messages`) with structured output, instead of the OpenAI-compatible one.
- Download the "Copy for review" payload as a `.md` file (for very large units or chat apps that cap pastes).
- Include slide text when copying for review from a share link (would mean storing slide text server-side, which v1.x deliberately avoids).

## Study experience

- Shuffle flashcards.
- Retake only the quiz questions you got wrong.
- Edit or delete a bad card.
- Export to Anki / CSV, or print the summary.
- Choose how many cards or questions you want.

## Product surface (explicitly out of scope for v1)

- Several saved sets / history of past uploads.
- Accounts and cross-device sync.
- Spaced repetition and "come back tomorrow" reviews.
- PPTX, DOCX, scanned PDFs (OCR), past papers.
- Upload and password-attempt limits stored outside server memory (e.g. Redis), so they hold across Vercel instances; a proper per-key spending dashboard.

## Share links (parked in v1.1)

- Delete / unshare a set, or give links an expiry date.
- Edit a shared set.
- See whether a link was opened (view counts).
- "Keep this set" on a share page: copy it into your own home-page slot.
- Use the phone's native share sheet (WhatsApp etc.) instead of copy-paste.
- Link previews in chat apps (set title in the preview). Note: that would show the title to people without the password.
- A small admin script to list and clean up stored sets.
- A custom domain instead of studying-with-kube.vercel.app.
