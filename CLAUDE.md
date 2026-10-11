@AGENTS.md

# StudyingKube

v1 is a test of one question: can the engine turn a unit of lecture slides (~70 pages) into flashcards, MCQs and a crammable summary that a first-year student would actually cram from? It is deliberately one page and nothing else. The founder (Prince) decides product scope; see README.md.

- Record meaningful technical decisions in `DECISIONS.md` (what, alternatives, why).
- Park out-of-scope ideas in `LATER.md` instead of building them.
- The engine is in `lib/`. When output quality is off, start with `lib/prompts.ts`, then `lib/generate.ts` (chunking and item counts).
- Model calls go through `callModelJson()` in `lib/model.ts`; `KUBE_PROVIDER` (`openrouter` | `aimlapi`) picks the provider, and per-provider differences live in `lib/providers/`. Default model: `anthropic/claude-haiku-5.5` on both.
- "Copy for review" (`lib/reviewPayload.ts`) runs in the browser only; the slide text it includes is kept in the browser's localStorage, never sent to the server.
- Never store uploaded PDFs or their extracted text server-side, and never log slide content. The only thing stored server-side is the generated study set, as a private Vercel Blob for its share link (`lib/shareStore.ts`).
- The PDF is read in the browser (`lib/readPdf.ts`) and only its text is posted: Vercel caps request bodies at 4.5 MB.
- Every page and API route sits behind the `KUBE_ACCESS_PASSWORD` gate in `proxy.ts` (off when the variable is unset).
