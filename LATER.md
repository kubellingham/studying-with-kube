# Later

Ideas that came up while building v1 and were deliberately not built, because they're outside the v1 brief. One line each. Whether any of them happen is Prince's call.

## Depth tiers (strategic, parked in v1.3)

- **Tiers:** free gets Balanced, the default; paid gets Balanced + Deep dive + Exam mode.
- **Deep dive:** a different prompt that writes what / why / how for every concept, about 60–80 cards and 20–30 MCQs for a 70-page unit.
- **Exam mode:** writes long-answer and past-paper-style questions.
- **Status:** both are paid-tier differentiators. Don't build until Prince greenlights the paid-tier design.

## Engine candidates parked in v1.3.1

- **Candidates A, B, D and F** from `thinking-break.md` §4, as listed there. They include the quiz–flashcard overlap (A), coverage balance, leaving out questions the slides already ask, and open-ended prompts. All are real issues; none had evidence strong enough to justify a bigger diff right before testers arrive.
- **Seen while testing v1.3.1:**
  - **Repetitive question shapes.** The same-category distractor rule makes quizzes lean on "which protocol / which level?" questions (4–6 of 10 on the IoT Levels deck). This is part of the coverage-balance candidate.
  - **Small sets can't make a 4-option MCQ.** A set with only three members (MQTT QoS 0/1/2) now becomes a flashcard instead. A 3-option or true/false question type would cover it, but that's a UI change.
  - **Noisy page warning.** The "check these pages" warning also lists section-divider slides, because a heading over a diagram and a divider look the same in text.
  - **Backstop only checks MCQ options.** The invented-label check could also cover flashcard answers, as a grounding check.
- **More PowerPoint text:** reading image alt text, chart titles and, optionally, speaker notes. That's cheap text, no vision, but nothing has asked for it yet.

## Engine quality (most relevant if v1's output falls short)

- Grounding check: a second, cheap model pass that checks each card against the page it cites and drops anything the page doesn't support.
- "Show me the slide text" on any card or question, to check grounding without opening the PDF.
- Thumbs up/down on individual cards and questions, to collect real quality data from testers.
- A small evaluation set (a few real LPU PDFs plus a scoring checklist) to compare models and prompt changes side by side.
- Read diagrams and image-only slides with a vision model instead of skipping them. This matters more now that PowerPoint files are accepted (v1.3.1): they're often more visual than PDFs, and anything inside a picture, chart or screenshot is invisible to Kube. That makes vision a stronger case for a paid tier.
- Meaning-based dedupe across the whole deck (e.g. embeddings). v1.3 matches reworded questions and shows each call the previous run's pages, but a recap at the end of a long unit can still repeat early material.
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
- DOCX, scanned PDFs (OCR), images as input, past papers. (PPTX shipped in v1.3.1.)
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
