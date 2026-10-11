@AGENTS.md

# StudyingKube

v1 is a test of one question: can the engine turn a unit of lecture slides (~70 pages) into flashcards, MCQs and a crammable summary that a first-year student would actually cram from? It is deliberately one page and nothing else. The founder (Prince) decides product scope; see README.md.

- Record meaningful technical decisions in `DECISIONS.md` (what, alternatives, why).
- Park out-of-scope ideas in `LATER.md` instead of building them.
- The engine is in `lib/`. When output quality is off, start with `lib/prompts.ts`, then `lib/generate.ts` (chunking and item counts).
- Never store uploaded PDFs or their text server-side, and never log slide content.
