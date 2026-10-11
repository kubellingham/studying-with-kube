# StudyingKube (v1 test build)

Upload one PDF of lecture slides. About 30 seconds later you get three things to cram from:

- **Flashcards.** One fact per card. Flip them, mark each one "know it" or "don't know", then go back over the ones you didn't know.
- **Quiz.** Multiple-choice questions, one at a time. After each answer you see the right one and a one-line reason.
- **Summary.** A short revision summary organized by the slides' own topics.

Every item shows the PDF page it came from, so you can check it against your slides.

This build tests one question: is the output good enough to cram from? It's a single page with no accounts and no database. The generated set lives in your browser's local storage, and the server keeps nothing. See `DECISIONS.md` for the technical choices and `LATER.md` for ideas that were deliberately left out.

## Run it

You need Node.js 20.9 or newer and an [OpenRouter](https://openrouter.ai) API key with some credit on it.

```bash
npm install
cp .env.example .env.local     # then paste your key into OPENROUTER_API_KEY
npm run dev
```

Open http://localhost:3000 and upload a PDF.

While it runs, the terminal prints a line for every model call (time taken, tokens, cost) and a summary line for each upload, for example:

```
[kube] "OS_Unit2.pdf": 70 pages (35120 chars) -> 58 flashcards (1 long fronts, 0 long backs), 19 MCQs, 11 summary sections, ~$0.180
```

These lines never include your slide text.

## Environment variables

Put these in `.env.local`. Only the key is required.

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | (none, required) | Your OpenRouter key. Set a credit limit on the key in OpenRouter as a hard spending cap. |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-5.5` | Any OpenRouter model id. To compare quality against a ~20x cheaper model, try `anthropic/claude-haiku-5.5`. |
| `OPENROUTER_REASONING_EFFORT` | `low` | How hard the model thinks before writing: `low`, `medium`, `high` or `off`. Higher effort is slower and costs more. |
| `KUBE_LIMIT_PER_IP_PER_HOUR` | `10` | Uploads allowed per IP address per hour. |
| `KUBE_LIMIT_PER_DAY` | `50` | Uploads allowed per day in total. |
| `KUBE_MAX_CONCURRENT` | `3` | Uploads that can be generating at the same moment. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Only for pointing at a proxy or a mock server while testing. |

Restart `npm run dev` after changing `.env.local`.

## What it accepts

- PDF only, with selectable text. Scanned or image-only PDFs are rejected with a message.
- Up to 100 pages and 20 MB, which covers one unit of slides.
- Pages that are only images or diagrams are skipped, and the app tells you how many were skipped.

## Where things are

| Path | What's there |
| --- | --- |
| `lib/prompts.ts` | The prompts and JSON shapes. Start here if the output quality is off. |
| `lib/generate.ts` | Splits the PDF into chunks, calls the model in parallel, and assembles the set. |
| `lib/pdf.ts` | Text extraction and header/footer cleanup. |
| `lib/openrouter.ts` | Model calls with retries and fallbacks. |
| `lib/normalize.ts` | Checks and cleans up what the model returns. |
| `lib/rateLimit.ts` | The cost guards. |
| `app/api/generate/route.ts` | The one API endpoint. |
| `components/` | The page: uploader, flashcards, quiz, summary. |
| `lib/storage.ts` | Browser persistence. |

Useful commands: `npm run lint`, `npm run typecheck`, `npm run build`.
