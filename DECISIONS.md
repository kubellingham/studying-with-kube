# Decisions

Each technical decision behind the test build: what was chosen, what else was considered, and why. The v1 decisions come first. The v1.1 decisions (deployment, password, share links) are in their own section at the end. Where v1.1 changed a v1 decision, the v1 section says so.

---

## Repo and branches

**Chose:** `main` starts as a one-commit stub (just a README line). All v1 work is on a feature branch and reaches `main` through a pull request.
**Why:** The repo was completely empty, and a PR needs a `main` to target. The stub keeps `main` "always working" (there's nothing to break) until v1 is reviewed.
**Note:** The brief suggested the branch name `v1-engine`. The build session was set up to push to `claude/pensive-planck-8x46eo`, so the work is on that branch. The name is the only difference.

## Framework: Next.js 16 + TypeScript + Tailwind CSS 4

**Chose:** Next.js 16.3.8 (App Router), React 19, TypeScript, Tailwind 4.
**Considered:** Vite + a separate small Node server; Next.js 16.4.0.
**Why:** Prince already knows Next.js, and one project covers both the page and the API endpoint. Version 16.3.8 rather than 16.4.0 because 16.4.0 came out five days before this build, and a test should run on a version with a few weeks of fixes behind it. There's no component library: the UI is small enough that Tailwind on its own stays readable.

## Reading the PDF: `unpdf`

> **Changed in v1.1:** the text is now extracted in the browser and only the text is sent to the server. See "PDF text is read in the browser" below.

**Chose:** [`unpdf`](https://github.com/unjs/unpdf), a server-friendly build of Mozilla's pdf.js, to extract text page by page.
**Considered:** `pdf-parse` (older, with known bundling problems in Next.js); sending the PDF straight to the model as a document (more tokens per page, it can't tell us up front that a PDF is a scan, and images are out of scope anyway).
**Why:** It keeps page boundaries, which every item needs for its page citation. It runs in plain Node with no native dependencies and no disk access.

**Cleanup before the model sees anything:**
- Short lines that repeat on at least 40% of pages are removed as headers and footers. Digits are ignored when comparing lines, so "Lovely Professional University 12" and "…13" count as the same footer. Bare slide numbers are removed too.
- Pages left with no text (image-only slides) are skipped and reported to the user.
- Each page is tagged `[[PAGE n]]` so the model can say where every item came from.

## AI provider: OpenRouter, called with plain `fetch`

**Chose:** OpenRouter's OpenAI-compatible chat endpoint, called directly with `fetch` and no SDK.
**Considered:** The Anthropic API directly, using its official SDK.
**Why:** Prince already has an OpenRouter setup from the previous repo, so there's no new account. The bigger reason is that this build exists to judge output quality, and OpenRouter lets you try another model by changing one line in `.env.local`. When the model is settled and we're productizing, going direct to the provider is worth revisiting: it avoids OpenRouter's fee and gives finer control, such as prompt caching (see `LATER.md`).

## Model: Claude Sonnet 5.5 by default, Claude Haiku 5.5 as the cheap comparison

**Chose:** `anthropic/claude-sonnet-5.5`, with reasoning effort `low`.
**Considered:** `anthropic/claude-haiku-5.5` (about 20x cheaper), Gemini Flash and GPT-5.x mini-class models.

Prices are from OpenRouter's model list at build time (October 2026), in US dollars per million tokens, input / output:

| Model | Price | Est. cost per 70-page unit |
| --- | --- | --- |
| Claude Sonnet 5.5 | $2 / $10 | ~$0.15–0.25 |
| Claude Haiku 5.5 | $0.10 / $0.50 | under $0.01 |

The estimate assumes a typical 70-page deck: about 28k input tokens and 11k output tokens across all calls.

**Why Sonnet first:** This session tests whether the engine *can* clear the quality bar. Starting with the stronger model answers that cleanly. If we started with the cheap model and the output fell short, we wouldn't know whether the prompts or the model were at fault. The quality bar also leans on judgment: plausible distractors, refusing to add outside facts, splitting compound ideas. Stronger models are noticeably better at exactly these.
**Recommended next step:** Once Sonnet's output passes, run the same PDF with `OPENROUTER_MODEL=anthropic/claude-haiku-5.5` and compare. If Haiku is close enough, the per-student cost of the product drops to almost nothing.
**Settings:** Reasoning effort `low`. The task is structured rewriting of the given text, not hard reasoning, and higher effort mostly adds time against the ~30-second goal. You can change it with `OPENROUTER_REASONING_EFFORT`. No `temperature` is sent, because the current Claude models reject non-default sampling settings.

## Generation pipeline: many small parallel calls

**Chose:** Split the pages into runs and call the model for all of them at once:
- **Flashcards and MCQs:** one call per run of about 6,000 characters of slide text (roughly 8 to 25 slides), up to 10 calls.
- **Summary:** one call per run of about 24,000 characters (a 70-page deck is usually 1 or 2 calls), up to 4 calls.

Everything runs at the same time, so the whole set takes about as long as the slowest single call.

**Considered:** One big call for everything, or one call per output type.
**Why:**
1. **Coverage.** Given 70 pages in one go, models tend to over-cover the first pages and thin out towards the end. When each call only sees its own pages and is asked for a set number of items from them, the end of the unit gets as much attention as the start.
2. **Speed.** One call writing 60 cards, 20 questions and a summary means roughly 10k output tokens written one after another, which is well over a minute. Split up, each call writes about 1–2k tokens.

**How many items:** Based on the amount of text, with a minimum per page so sparse decks still get decent coverage:
- Flashcards: the larger of characters ÷ 650 and pages × 0.6, capped between 8 and 90.
- MCQs: the larger of characters ÷ 2000 and pages × 0.22, capped between 4 and 30.

A 70-page deck comes out at roughly 40–75 flashcards and 15–25 MCQs, in line with the brief. Each run gets its share in proportion to its text. The prompt says to write fewer if the pages are thin ("never pad") and allows up to a third more if they're dense.

**Assembly:**
- Cards with an identical question from different runs are dropped as duplicates.
- Summary sections that straddle a run boundary (the same heading at the end of one part and the start of the next, including "(contd.)" variants) are merged into one.
- Items stay in slide order.

## Prompts

The prompts live in `lib/prompts.ts`: one system prompt for flashcards and MCQs, and one for the summary. They're written to the quality bar in the brief:

- **Grounding comes first.** "Only what the slides say": no outside facts, definitions or examples, even if they're true. If a slide names a term without explaining it, the model skips it rather than explaining it. If something depends on a diagram it can't read, the model skips it. "Leaving something out is always better than inventing it." MCQ distractors are the one exception, because they're meant to be wrong.
- **Coverage.** Spread items across every page with teachable content, start to end. Skip admin slides: title, agenda, learning outcomes, references, thank-you slides, and question-only slides with no answers.
- **Flashcards.** One fact per card, with the front under 15 words and the back under 30 (usually under 15), in the slides' own terms. The cards must stand on their own: no "this slide".
  - *One interpretation to flag:* a card may ask for a short named list ("Name the five process states") when the list itself is what students memorize. That's one idea, and it matches how LPU exams ask "list the…" questions. The prompt also asks for a separate card for each item when the slides explain it. "What is X and how does it differ from Y?" is always split.
- **MCQs.** The model writes the correct option and exactly 3 distractors separately, and the server shuffles them. Models tend to put the right answer in the same positions, and writing "correct" separately also avoids answer-index mistakes. Distractors must be plausible: sibling concepts and common confusions from the same slides, matched in length and style. "All of the above"-type options are banned (and filtered out in code), because shuffling breaks them. Worked numbers must come from the slides; the model doesn't invent new calculations. Each question gets a one-line "why".
- **Every item** carries a `topic` (the slide heading) and the `pages` it came from. The pages appear in the UI as "p. 12" so Prince can check any item against the PDF.
- **Summary.** Topic headings follow the slides' order and wording, with consecutive slides merged. Each section has 2–6 bullets under 25 words each, with at most one **bold** key term per bullet and no other formatting.

## Structured output and failure handling

**Chose:**
- Ask OpenRouter for strict JSON-schema output (`response_format: json_schema`, `strict: true`), with `provider.require_parameters: true` so it only routes to providers that support it. The prompt also spells out the JSON shape, as a backup.
- If OpenRouter rejects an optional parameter (400) or finds no provider that supports them (404), the call is retried once as a plain request without schema or reasoning settings. The server remembers this for the rest of its run.
- Transient errors (429, 5xx, network) and unparseable output get one retry, unless 40 seconds have already passed. Each attempt times out after 90 seconds.
- A bad key (401) or no credits (402) stops everything immediately with a plain-English message.
- The model's output is checked and cleaned item by item (`lib/normalize.ts`). A malformed card is dropped; it doesn't fail the whole set. MCQs need 4 distinct options. Page numbers that aren't real pages of this PDF are removed.
- If one chunk fails after retrying, the rest of the set is still returned, with a warning such as "Flashcards and MCQs for pages 46–70 couldn't be generated." The request only fails outright if every call fails.

**Why:** A partial set with a clear note is more useful the night before an exam than an error screen. The fallbacks matter because OpenRouter parameter support differs between models, and Prince may well try several.

## Contract between server and browser

> **Changed in v1.1:** the request is now JSON `{ fileName, pages: string[] }` (each page's raw text) instead of the PDF file. The `done` event also carries `shareId`.

**Chose:** `POST /api/generate` takes a multipart form with a `file` field.
- **Problems found before any model call** come back as normal JSON errors with a status code: no key configured (500), not a PDF (415), too big (413), scanned or unreadable (422), rate limited (429 with `Retry-After`).
- **Once generation starts,** the response is a stream of newline-delimited JSON events (types in `lib/types.ts`):
  - `stage`: a status message.
  - `progress`: `{done, total}` as each model call finishes.
  - `done`: the complete `StudySet`.
  - `error`: a message.

**Considered:** A single JSON response.
**Why:** A silent 30-second spinner feels broken. Streaming progress lets the page show real "3 of 7 parts done" progress at almost no cost in complexity. If the user cancels or closes the tab, the server stops the model calls in flight, so a cancelled upload stops costing money.

`StudySet` is the one shape both sides share: id, title, source info (file name, page counts), model used, summary sections, flashcards, MCQs (options already shuffled, with `answerIndex`) and warnings. It carries `version: 1` so a future format change can recognize old data.

## Protecting against runaway cost

**Chose:** In-memory limits in `lib/rateLimit.ts`, all adjustable in `.env.local`:
- 10 uploads per IP address per hour.
- 50 uploads per day in total.
- At most 3 generating at once, and 1 per IP.

Each upload is also bounded:
- At most 100 pages, 20 MB and 200,000 characters of text.
- At most 10 + 4 model calls.
- An output-token cap on every call.

Validation (is it a PDF, is it readable) happens *before* the rate limiter, so a rejected file doesn't use up an upload.

**Also recommended:** Set a credit limit on the OpenRouter key itself (e.g. $5). That's the real hard cap, and it costs nothing to set.
**Considered:** A Redis/Upstash-backed limiter.
**Why:** For a local, single-process test build, memory is enough. Counters reset when the server restarts and are shared across dev hot-reloads. If this is ever deployed, the limiter needs shared storage, and the IP should come only from a trusted proxy header, because anyone can fake `X-Forwarded-For`. The daily total cap is the backstop for that.

## Persistence in the browser

**Chose:** `localStorage`, under two keys:
- `kube:v1:set`: the current `StudySet`, usually 30–80 KB.
- `kube:v1:progress`: the student's progress through that set. That covers which tab is open, the position in the flashcard deck, each card's "know"/"don't know" mark, the position in the quiz, and the chosen answer for each question. It's tied to the set's id.

**Behavior:**
- Close the tab and come back: you return to the same set, tab and card.
- Uploading a new PDF replaces the set and progress, but only after the new set has been generated. A failed upload doesn't wipe what you had.
- **Reset** (after a confirmation) deletes both keys.
- Anything unreadable or from a different format version is ignored rather than crashing the page.
- If the browser refuses to save (storage full or disabled), the page says so, and the set lasts until the tab closes.

The page renders only in the browser, never on the server, because its first render reads `localStorage`. That avoids a flash of the wrong content.

## Privacy: nothing kept on the server

> **Changed in v1.1:** generated study sets are now stored (privately) for share links. The PDF and its text still never are. See "What's stored now" below.

The PDF is read into memory for the length of the request, its text is sent to the model, and then it's gone. Nothing is written to disk, cached, or logged; the server log records counts, timings and costs only. One unavoidable caveat: the slide text does go to OpenRouter and to the model provider (Anthropic by default) to be processed, under their data policies.

## Interface

- **One page, three tabs** (Flashcards, Quiz, Summary) under the set's title. "New PDF" and "Reset" sit in the header.
- **Flashcards:** a card that flips in 3D (the animation is off for people who've turned on reduced motion), previous/next, and "Don't know" / "Know it", which mark the card and move to the next one. Keyboard: Space flips, ← → move, 1 and 2 mark.
  - *Small addition beyond the brief:* "Review don't-knows" runs through just the cards you marked "don't know", and the end of the deck shows your counts. Without this, the marks wouldn't do anything. It stays inside this set: it's not spaced repetition or tracking across sessions.
- **Quiz:** one question at a time. An answer is final once chosen. You immediately see the correct option in green, your wrong pick in red, and the one-line "why". Keyboard: 1–4 or A–D to answer, Enter for the next question. The end screen shows your score and lists the questions to go over. You can skip a question.
- **Summary:** numbered topic cards with page ranges and bold key terms. On wide screens a sticky list of topics on the left lets you jump around.
- **Every item** shows its PDF page.
- Follows the system's light or dark mode, since cramming often happens at night. Works at phone width.

## How this was tested

There's no test suite. It wasn't required, and the open question is output quality, which only a person can judge. Instead, the full flow was checked locally:
- A 70-page sample slide deck was generated, with repeated footers, slide numbers and an image-only page, like real LPU slides.
- The real app ran against a **mock OpenRouter server**: parallel calls, streaming progress, normalization, dedupe, merging, retries after a 500 and after bad JSON, the plain-request fallback after a 400, a partial chunk failure, out-of-credits, everything failing, cancelling mid-run, the per-IP and concurrency limits, and scanned and non-PDF uploads.
- The whole UI ran in headless Chromium: upload, progress, flip, mark, reload to check persistence, review pile, full quiz to results, summary, reset, dark mode and phone width. There were no console errors.

**Not tested:** real model output. No OpenRouter key was available in the build environment, so the prompts have not yet been run against Claude. That is exactly what Prince's test with real slides is for.

---

# v1.1: deployment, access password, share links

## Hosting: one Vercel project, deployed from GitHub

**Chose:**
- A Vercel project, `studying-with-kube` (team "kubellingham's projects"), linked to the GitHub repo, so every push to a branch deploys automatically.
- The first push (branch `v1.1-deploy-share`) went out as the project's production deployment. That gave it the short URL **https://studying-with-kube.vercel.app**.
- Functions run in `iad1` (US East), close to OpenRouter and the model providers.

**Vercel's own login wall is switched off.** Vercel puts its "Deployment Protection" (Vercel Authentication) on new projects by default. It only lets in people logged into Vercel with access to the team, which would block Prince's phone and anyone he shares with. The app's own password gate (next section) replaces it.

**Considered:** Vercel's built-in Password Protection. It's a paid add-on, and the app-level gate does the same job for free.

**Note for later:** after both PRs are merged, check **Settings → Git → Production Branch** is `main`, so the short URL keeps following `main`.

## Access password: a cookie gate in `proxy.ts`

**Chose:** Next.js 16's `proxy.ts` (what used to be called middleware) checks every request except build assets and the icon. The gate is a no-op when `KUBE_ACCESS_PASSWORD` is unset, so local development isn't blocked.
- **Pages without a valid cookie** are answered with the `/unlock` page at the **same URL** (a rewrite, not a redirect). Nothing about the requested page or set is sent, and the response is marked `private, no-store` so no cache keeps it. Once the password is right, the page simply reloads the URL the visitor was already on, e.g. their share link.
- **API calls without the cookie** get a 401, so nobody can spend OpenRouter credit without the password. Pages that have been unlocked call the API normally, because the browser sends the cookie along.
- **`/api/unlock`** checks the password in constant time and sets an `HttpOnly`, `SameSite=Lax` cookie that lasts 90 days ("enter the password once"). It's also `Secure` on https. A wrong guess is answered only after a 0.7 s delay.
- **The cookie value** is an HMAC derived from the password, never the password itself. Changing `KUBE_ACCESS_PASSWORD` therefore signs every device out.
- **The password** is four random words plus a number (about 35 bits). With the delay on every wrong guess, guessing it isn't practical, and Prince can rotate it from the Vercel dashboard at any time.

**Considered:**
- **HTTP Basic Auth:** the ugly browser pop-up, re-prompts on phones, and no way to sign out.
- **Vercel's password protection:** paid (see above).

## Share-link storage: Vercel Blob, private

**Chose:** One private Vercel Blob file per set, at `sets/<shareId>.json`, with no expiry.
- **Saved automatically** when a set is generated (`allowOverwrite: false`).
- **Read by the `/s/[id]` page on the server**, after the password check.
- **Private access** means a blob has no public URL; it can only be read with the project's server-side token. So the password gate can't be sidestepped by finding a storage URL.

**Considered:**
- **Vercel KV:** no longer offered as a first-party Vercel product; Redis now comes through a Marketplace integration (Upstash). That's an extra account and integration for what is a single "get JSON by key" lookup.
- **Any database:** out of scope by the brief.

**Without Blob credentials:**
- **Locally**, sets are kept in the dev server's memory, so share links work until it restarts.
- **On Vercel**, sharing switches off and the set shows "Share links aren't set up on this server yet". Silently hiding the button would leave Prince wondering where it went.

**Setup gap:** the Vercel connection used to build this wasn't allowed to create storage stores (a 403 from the API), so Prince creates the Blob store in the dashboard. The steps are in README.

## Share ID shape

**Chose:** 15 random bytes from Node's `crypto.randomBytes`, encoded as base64url. That gives exactly 20 URL-safe characters (`A–Z a–z 0–9 _ -`), or 120 bits: unguessable, and short enough to send in a chat.

IDs are checked against `^[A-Za-z0-9_-]{20}$` before any storage lookup, so malformed links never reach storage. The ID is stored inside the set (`shareId`) and returned in the generation response's `done` event.

## The `/s/[id]` page

- **The set is loaded on the server** (after the gate) and handed to the same study components as the home page. They are now shared through `components/StudyView.tsx`.
- **Read-only:** nothing is ever written back to the stored copy.
- **The viewer's own progress** (marks, quiz answers, position) lives in their browser under `kube:v1:shared-progress`. It's separate from the home page's set, and opening a share link never replaces the viewer's own set at `/`. Like the home page, it holds one set at a time: opening a different shared set starts its progress fresh.
- **Unknown or malformed IDs** get a "This share link doesn't open a set" page (HTTP 404). A storage outage gets a "Try again" page.
- Share pages and the unlock page tell search engines not to index them.

## PDF text is read in the browser (needed for Vercel)

**Problem:** Vercel functions accept request bodies of at most 4.5 MB, and lecture-slide PDFs are often 5–15 MB. v1 uploaded the PDF itself, so most real decks would have failed on Vercel with "payload too large".

**Chose:** The browser reads the PDF's text with the same pdf.js library (`unpdf`, now in `lib/readPdf.ts`), loaded only when a file is picked. It then sends JSON with each page's raw text, about 15 KB for the 70-page test deck.
- **The server still does all the cleanup** (headers/footers, slide numbers) in `lib/pdf.ts`.
- **The server re-checks every limit:** at most 3 MB of JSON, 100 pages and 200k characters of text, plus the scanned-PDF check. Nothing the browser sends is trusted.
- **Prompts, chunking and the model are untouched.**

**Side benefits:**
- Uploads from a phone are fast, because it sends kilobytes, not megabytes.
- The PDF file itself now never leaves the device.

**Considered:** Uploading the PDF to Blob storage from the browser, then having the server fetch it, process it and delete it. That's more moving parts (an upload-token route, temporary storage, cleanup if a request dies), and it stores the PDF, however briefly.

## Upload limits on Vercel

The upload limits (`lib/rateLimit.ts`) are kept in server memory. On Vercel the app can run on several instances at once, each counting separately, so they're a speed bump rather than a cap. Unchanged from v1 on purpose: the password gate keeps strangers out, and **the credit limit on the OpenRouter key is the real spending cap**. README says so.

## What's stored now

| Where | What | How long |
| --- | --- | --- |
| Vercel Blob (private) | Each generated set: title, file name, page counts, cards, questions, summary, warnings, model name | Until deleted (no expiry in v1.1) |
| Your browser | Your current set and your progress; progress on the last shared set you opened | Until Reset / new upload |
| Nowhere | The PDF file and its extracted text | |

## How v1.1 was tested

- **Locally, against the mock OpenRouter, in headless Chromium:**
  - **Upload:** the browser reads the PDF and posts 15 KB of JSON instead of the file.
  - **Share link:** opened in a second, phone-sized browser shows the identical set (same title and counts). Its progress survives a reload and is stored separately; that "phone"'s own home page is unaffected.
  - **Bad files and links:** locked and scanned PDFs show clear messages and keep the current set. Unknown and malformed IDs give the 404 page.
  - **The full v1 UI flow** (flip, marks, review pile, quiz, summary, reset) still passes unchanged.
- **The gate, locally and on the live deployment:**
  - Pages without the cookie get only the password form; share pages leak no set content.
  - APIs return 401 without the cookie.
  - A wrong password stays locked; the right one sets a `Secure; HttpOnly` cookie and reloads the same URL.
  - Unlocked requests reach the app and the generate API.
- **On the live deployment, in a phone-sized browser:** unlock, then upload. The production bundle reads the PDF in the browser and posts the text. It stops at "The server has no OPENROUTER_API_KEY", as expected until the key is added.

**Not tested on Vercel:**
- **Generation itself:** the OpenRouter key isn't set yet.
- **Blob storage:** the store can't be created from here (see above). Both start working as soon as Prince adds them and redeploys.
