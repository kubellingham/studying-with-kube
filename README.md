# StudyingKube (test build)

Upload one PDF of lecture slides. About 30 seconds later you get three things to cram from:

- **Flashcards.** One fact per card. Flip them, mark each one "know it" or "don't know", then go back over the ones you didn't know.
- **Quiz.** Multiple-choice questions, one at a time. After each answer you see the right one and a one-line reason.
- **Summary.** A short revision summary organized by the slides' own topics.

Every item shows the PDF page it came from, so you can check it against your slides. Each set also gets a **share link** (`/s/<id>`) that opens the same set on any device.

This build tests one question: is the output good enough to cram from? It has no accounts and no database. One shared access password protects the deployed site. See `DECISIONS.md` for the technical choices and `LATER.md` for ideas that were deliberately left out.

## The deployed version (Vercel)

**URL:** https://studying-with-kube.vercel.app

It's the Vercel project `studying-with-kube` in the "kubellingham's projects" team, linked to this GitHub repo.
- **The short URL above** serves the deployment marked **Production**. For now that's the first build of the `v1.1-deploy-share` branch. Once the PRs are merged, every push to `main` updates it.
- **Every other push** gets its own preview deployment, e.g. https://studying-with-kube-git-v11-deploy-share-kubellinghams-projects.vercel.app for this branch. Previews use the same password and share the same stored sets.

### The access password

- The password is the `KUBE_ACCESS_PASSWORD` environment variable on the Vercel project. It isn't stored in the code.
- Visitors enter it once per device. A cookie remembers it for 90 days.
- Every page needs it, including share links (`/s/<id>`). Without the password, a visitor only ever sees the password box.

**To change it:**
1. In Vercel, open **studying-with-kube → Settings → Environment Variables** and edit `KUBE_ACCESS_PASSWORD`.
2. Open **Deployments**, then **⋯ → Redeploy** on the one marked **Production**. Environment variables only take effect on a new deployment.

Changing the password signs every device out.

### One-time setup still needed in Vercel

1. **Add the OpenRouter key.** Under **Settings → Environment Variables**, add `OPENROUTER_API_KEY` for Production and Preview, marked *Sensitive*. Without it, uploads fail with a message saying the key is missing.
2. **Create the storage for share links.** Under **Storage → Create → Blob**, choose **Private** access and connect the store to `studying-with-kube` for all environments. Vercel then adds `BLOB_READ_WRITE_TOKEN` to the project by itself. Until this exists, sets still generate, but they show "Share links aren't set up on this server yet".
3. **Redeploy** the deployment marked **Production** (Deployments → ⋯ → Redeploy) so the new variables take effect.

### Cost

**The credit limit on your OpenRouter key is the main cost guard.** Set one, e.g. $5, under OpenRouter → Keys. The app's own upload limits (per IP per hour, per day, at most 3 at once) live in server memory. On Vercel the app can run on several servers at once, each with its own count, so treat those limits as a speed bump, not a cap.

## Run it locally

You need Node.js 20.9 or newer and an [OpenRouter](https://openrouter.ai) API key with some credit on it.

```bash
npm install
cp .env.example .env.local     # then paste your key into OPENROUTER_API_KEY
npm run dev
```

Open http://localhost:3000 and upload a PDF.

Locally:
- **No password.** The password check only switches on when `KUBE_ACCESS_PASSWORD` is set. Leave it unset in `.env.local`.
- **Share links work without Blob storage.** Sets are kept in the dev server's memory, so links work until you restart it.

While it runs, the terminal prints a line for every model call (time taken, tokens, cost) and a summary line for each upload, for example:

```
[kube] "OS_Unit2.pdf": 70 pages (35120 chars) -> 58 flashcards (1 long fronts, 0 long backs), 19 MCQs, 11 summary sections, ~$0.180
```

These lines never include your slide text. On Vercel they appear in the project's **Logs** tab.

## Environment variables

Locally they go in `.env.local`; on Vercel, under **Settings → Environment Variables**. Only the OpenRouter key is required.

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | (none, required) | Your OpenRouter key. Set a credit limit on the key in OpenRouter as a hard spending cap. |
| `KUBE_ACCESS_PASSWORD` | (unset = no password) | The shared password for the whole site. Set on Vercel; leave unset locally. |
| `BLOB_READ_WRITE_TOKEN` | (set by Vercel) | Added automatically when a Blob store is connected. Enables share links on Vercel. |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-5.5` | Any OpenRouter model id. To compare quality against a ~20x cheaper model, try `anthropic/claude-haiku-5.5`. |
| `OPENROUTER_REASONING_EFFORT` | `low` | How hard the model thinks before writing: `low`, `medium`, `high` or `off`. Higher effort is slower and costs more. |
| `KUBE_LIMIT_PER_IP_PER_HOUR` | `10` | Uploads allowed per IP address per hour (per server instance). |
| `KUBE_LIMIT_PER_DAY` | `50` | Uploads allowed per day in total (per server instance). |
| `KUBE_MAX_CONCURRENT` | `3` | Uploads that can be generating at the same moment. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Only for pointing at a proxy or a mock server while testing. |

Restart `npm run dev` after changing `.env.local`, or redeploy after changing them on Vercel.

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
| `lib/pdf.ts` | Header/footer cleanup of that text, on the server. |
| `lib/openrouter.ts` | Model calls with retries and fallbacks. |
| `lib/normalize.ts` | Checks and cleans up what the model returns. |
| `lib/rateLimit.ts` | The upload limits. |
| `lib/shareStore.ts` | Saves and loads shared sets (Vercel Blob, or memory locally). |
| `lib/access.ts`, `proxy.ts` | The access-password gate. |
| `app/api/generate/route.ts` | Generates a set (and stores it for sharing). |
| `app/s/[id]/page.tsx` | Opens a shared set. |
| `components/` | The pages: uploader, study views, share link, password form. |
| `lib/storage.ts` | Browser persistence of your set and progress. |

Useful commands: `npm run lint`, `npm run typecheck`, `npm run build`.
