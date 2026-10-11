# StudyingKube (test build)

Upload one PDF of lecture slides. About 30 seconds later you get three things to cram from:

- **Flashcards.** One fact per card. Flip them, mark each one "know it" or "don't know", then go back over the ones you didn't know.
- **Quiz.** Multiple-choice questions, one at a time. After each answer you see the right one and a one-line reason.
- **Summary.** A short revision summary organized by the slides' own topics.

Every item shows the PDF page it came from, so you can check it against your slides. Each set also gets a **share link** (`/s/<id>`) that opens the same set on any device, and a **Copy for review** button that copies the whole set plus the slide text for checking in a chat.

This build tests one question: is the output good enough to cram from? It has no accounts and no database. One shared access password protects the deployed site. See `DECISIONS.md` for the technical choices and `LATER.md` for ideas that were deliberately left out.

## The deployed version (Vercel)

**URL:** https://studying-with-kube.vercel.app

It's the Vercel project `studying-with-kube` in the "kubellingham's projects" team, linked to this GitHub repo.
- **The short URL above** serves the deployment marked **Production**. For now that's the first build of the `v1.1-deploy-share` branch. Once the PRs are merged, every push to `main` updates it.
- **Every other push** gets its own preview deployment at a stable per-branch URL. Previews use the same password and share the same stored sets.
- **To test v1.2 before the PRs are merged,** use its branch URL, https://studying-with-kube-git-v12-provid-7fcfed-kubellinghams-projects.vercel.app. The short URL still runs the v1.1 build, which doesn't know about AI/ML API or Copy for review. To put v1.2 on the short URL instead: **Deployments →** newest `v1.2-provider-and-review` deployment **→ ⋯ → Promote**.

### The access password

- The password is the `KUBE_ACCESS_PASSWORD` environment variable on the Vercel project. It isn't stored in the code.
- Visitors enter it once per device. A cookie remembers it for 90 days.
- Every page needs it, including share links (`/s/<id>`). Without the password, a visitor only ever sees the password box.

**To change it:**
1. In Vercel, open **studying-with-kube → Settings → Environment Variables** and edit `KUBE_ACCESS_PASSWORD`.
2. Open **Deployments**, then **⋯ → Redeploy** on the one marked **Production**. Environment variables only take effect on a new deployment.

Changing the password signs every device out.

### One-time setup still needed in Vercel

1. **Add the AI model key.** Under **Settings → Environment Variables**, for Production and Preview:
   - **To use AI/ML API:** add `KUBE_PROVIDER` = `aimlapi`, and `AIMLAPI_API_KEY` = your key (mark it *Sensitive*).
   - **To use OpenRouter:** add `OPENROUTER_API_KEY` (*Sensitive*). `KUBE_PROVIDER` can stay unset, since OpenRouter is the default.

   Without the key for the chosen provider, uploads fail with a message naming the missing variable.
2. **Create the storage for share links.** Under **Storage → Create → Blob**, choose **Private** access and connect the store to `studying-with-kube` for all environments. Vercel then adds `BLOB_READ_WRITE_TOKEN` to the project by itself. Until this exists, sets still generate, but they show "Share links aren't set up on this server yet".
3. **Redeploy** so the new variables take effect: Deployments → ⋯ → **Redeploy** on the deployment you're testing. For v1.2 that's the newest `v1.2-provider-and-review` deployment (or the one marked **Production**, once v1.2 is promoted or merged).
4. **Remove the old model override.** `OPENROUTER_MODEL` is still set to `anthropic/claude-sonnet-5.5` on the project from v1.1. Delete it, so OpenRouter uses the Haiku default. It doesn't affect AI/ML API.

### Cost

**The credit on your model provider is the main cost guard.** On OpenRouter, set a credit limit on the key (e.g. $5, under OpenRouter → Keys). AI/ML API is prepaid, so the balance itself is the cap. The app's own upload limits (per IP per hour, per day, at most 3 at once) live in server memory. On Vercel the app can run on several servers at once, each with its own count, so treat those limits as a speed bump, not a cap.

## Choosing the AI provider

One environment variable picks the provider for the whole server, and changing it only needs a restart or redeploy:

| `KUBE_PROVIDER` | Uses | Key variable | Model variable |
| --- | --- | --- | --- |
| `openrouter` (default) | [OpenRouter](https://openrouter.ai) | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |
| `aimlapi` | [AI/ML API](https://aimlapi.com) | `AIMLAPI_API_KEY` | `AIMLAPI_MODEL` |

Both providers can be configured at once; only the one `KUBE_PROVIDER` names is used.

**The default model is Claude Haiku 5.5 (`anthropic/claude-haiku-5.5`, the same ID on both providers): free-tier economics.** If the engine clears the quality bar on Haiku, it can run a free tier. When designing paid-tier generation, set `OPENROUTER_MODEL` or `AIMLAPI_MODEL` to `anthropic/claude-sonnet-5.5`.

## Run it locally

You need Node.js 20.9 or newer and an API key, with some credit on it, for [OpenRouter](https://openrouter.ai) or [AI/ML API](https://aimlapi.com).

```bash
npm install
cp .env.example .env.local     # then fill in KUBE_PROVIDER and that provider's API key
npm run dev
```

Open http://localhost:3000 and upload a PDF.

Locally:
- **No password.** The password check only switches on when `KUBE_ACCESS_PASSWORD` is set. Leave it unset in `.env.local`.
- **Share links work without Blob storage.** Sets are kept in the dev server's memory, so links work until you restart it.

While it runs, the terminal prints a line for every model call (time taken, tokens, cost) and a summary line for each upload, for example:

```
[kube] "OS_Unit2.pdf": 70 pages (35120 chars) -> 58 flashcards (1 long fronts, 0 long backs), 19 MCQs, 11 summary sections, aimlapi:anthropic/claude-haiku-5.5, ~$0.012
```

These lines never include your slide text. On Vercel they appear in the project's **Logs** tab.

## Environment variables

Locally they go in `.env.local`; on Vercel, under **Settings → Environment Variables**. The only required one is the API key of the provider `KUBE_PROVIDER` picks.

| Variable | Default | What it does |
| --- | --- | --- |
| `KUBE_PROVIDER` | `openrouter` | Which AI provider the server uses: `openrouter` or `aimlapi`. |
| `OPENROUTER_API_KEY` | (none) | Your OpenRouter key. Required when the provider is `openrouter`. Set a credit limit on the key in OpenRouter as a hard spending cap. |
| `OPENROUTER_MODEL` | `anthropic/claude-haiku-5.5` | Any OpenRouter model ID. Paid-tier candidate: `anthropic/claude-sonnet-5.5`. |
| `OPENROUTER_REASONING_EFFORT` | `low` | How hard the model thinks before writing: `low`, `medium`, `high` or `off`. Higher effort is slower and costs more. |
| `AIMLAPI_API_KEY` | (none) | Your AI/ML API key. Required when the provider is `aimlapi`. |
| `AIMLAPI_MODEL` | `anthropic/claude-haiku-5.5` | Any AI/ML API chat model ID. Paid-tier candidate: `anthropic/claude-sonnet-5.5`. |
| `AIMLAPI_REASONING_EFFORT` | `low` | Same as above, for AI/ML API: `low`, `medium`, `high` or `off`. |
| `KUBE_ACCESS_PASSWORD` | (unset = no password) | The shared password for the whole site. Set on Vercel; leave unset locally. |
| `BLOB_READ_WRITE_TOKEN` | (set by Vercel) | Added automatically when a Blob store is connected. Enables share links on Vercel. |
| `KUBE_LIMIT_PER_IP_PER_HOUR` | `10` | Uploads allowed per IP address per hour (per server instance). |
| `KUBE_LIMIT_PER_DAY` | `50` | Uploads allowed per day in total (per server instance). |
| `KUBE_MAX_CONCURRENT` | `3` | Uploads that can be generating at the same moment. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Only for pointing at a proxy or a mock server while testing. |
| `AIMLAPI_BASE_URL` | `https://api.aimlapi.com/v1` | Same, for AI/ML API. |

Restart `npm run dev` after changing `.env.local`, or redeploy after changing them on Vercel.

## Copy for review

The **Copy for review** button, next to "Share this set", copies the whole set to your clipboard as plain text (Markdown), ready to paste into a chat with a reviewer. It contains:

1. **A header:** file name, page count, model and provider, when it was generated, item counts, and any warnings.
2. **Every flashcard:** numbered `F1, F2…`, each with its topic, cited pages, question and answer.
3. **Every MCQ:** numbered `M1, M2…`, each with its topic, cited pages, question, correct option, wrong options and "why".
4. **The summary:** each section with its page range and bullets.
5. **The slide text exactly as the model saw it**, with `[[PAGE n]]` markers, so every citation can be checked against its page.

A 70-page unit is typically 30–60 KB. Paste it into the strategy chat and ask for a review against the quality bar: coverage, grounding, crammable shape, one idea per card.

- **Nothing leaves your browser.** The slide text is kept in this browser next to the set, so the button still works after a reload. It's never sent to the server or to a model.
- **On a share link (`/s/<id>`) the button copies the set without the slide text,** because share links don't carry it, and the payload says so. Use the button on the device that generated the set to include the slides.

## What it accepts

- PDF only, with selectable text. Scanned or image-only PDFs are rejected with a message.
- Up to 100 pages and 20 MB, which covers one unit of slides.
- Pages that are only images or diagrams are skipped, and the app tells you how many were skipped.
- The PDF is read in your browser, and only its text is sent to the server. The file itself never leaves your device.

## Where things are

| Path | What's there |
| --- | --- |
| `lib/prompts.ts` | The prompts and JSON shapes. Start here if the output quality is off. |
| `lib/generate.ts` | Splits the slides into chunks, calls the model in parallel, and assembles the set. |
| `lib/readPdf.ts` | Reads the PDF's text in the browser. |
| `lib/pdf.ts` | Header/footer cleanup of that text (on the server; the browser runs the same function for Copy for review). |
| `lib/model.ts` | Model calls with retries and fallbacks; picks the provider from `KUBE_PROVIDER`. |
| `lib/providers/` | What differs per provider: `openrouter.ts`, `aimlapi.ts`. |
| `lib/reviewPayload.ts` | Builds the "Copy for review" text (runs in the browser). |
| `lib/normalize.ts` | Checks and cleans up what the model returns. |
| `lib/rateLimit.ts` | The upload limits. |
| `lib/shareStore.ts` | Saves and loads shared sets (Vercel Blob, or memory locally). |
| `lib/access.ts`, `proxy.ts` | The access-password gate. |
| `app/api/generate/route.ts` | Generates a set (and stores it for sharing). |
| `app/s/[id]/page.tsx` | Opens a shared set. |
| `components/` | The pages: uploader, study views, share link, password form. |
| `lib/storage.ts` | Browser persistence of your set and progress. |

Useful commands: `npm run lint`, `npm run typecheck`, `npm run build`.
