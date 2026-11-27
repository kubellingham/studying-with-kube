@AGENTS.md

# StudyingKube

v1 is a test of one question: can the engine turn a unit of lecture slides (~70 pages) into flashcards, MCQs and a crammable summary that a first-year student would actually cram from? It is deliberately one page and nothing else. The founder (Prince) decides product scope; see README.md.

- Record meaningful technical decisions in `DECISIONS.md` (what, alternatives, why).
- Park out-of-scope ideas in `LATER.md` instead of building them.
- The engine is in `lib/`. When output quality is off, start with `lib/prompts.ts`, then `lib/generate.ts` (chunking and item counts).
- Model calls go through `callModelJson()` in `lib/model.ts`; `KUBE_PROVIDER` (`openrouter` | `aimlapi`) picks the provider, and per-provider differences live in `lib/providers/`. Default model: `anthropic/claude-haiku-5.5` on both.
- "Copy for review" (`lib/reviewPayload.ts`) runs in the browser only; the slide text it includes is kept in the browser's localStorage, never sent to the server.
- Never store uploaded slide files (PDF or PPTX) or their extracted text server-side, and never log slide content. What is stored server-side (Supabase, `supabase/migrations`): the account (Google name/email, plan), one usage row per generation (mode, status, pages, cost), and generated study sets behind share links (`lib/shareStore.ts`).
- The PDF or PPTX is read in the browser (`lib/readSlides.ts` → `readPdf.ts` / `readPptx.ts`) and only its text is posted: Vercel caps request bodies at 4.5 MB.
- Every page and API route needs Google sign-in (Supabase Auth, enforced in `proxy.ts`), except `/signin`, `/auth/*`, share links `/s/<id>` and `/api/keepalive`. Without `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`, local dev runs open; Vercel refuses to serve.
- Per-account caps live in the database (`quota`/`reserve_generation` in the migration), called as the signed-in user; the app holds no Supabase secret key. `npm run test:db` checks the SQL on PGlite.
