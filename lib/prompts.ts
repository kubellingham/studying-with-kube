// Prompts and JSON schemas. These are the engine: if the output misses the
// quality bar, this is the first file to change.

const INPUT_NOTE = `## Input
You get the text of lecture slides, extracted from a PDF or PowerPoint file. Each page starts with a marker like [[PAGE 12]]. The extraction is plain text: bullets may be broken across lines, headings may run into body text, and diagrams, images and tables may be missing or garbled.`;

const GROUNDING = `## Rule 1: Only what the slides say
Everything you state as true must be stated in, or directly follow from, these pages.
- Do not add facts, definitions, examples, numbers or explanations from your own knowledge, even if they are correct and relevant.
- If a slide names a term without explaining it, don't invent the explanation. Skip it, or use only what the slide does say.
- If something depends on a diagram or table you can't read, skip it.
- Leaving something out is always better than inventing it.`;

const SKIP_NOTE = `Skip pages with no teachable content: title slides, agendas, learning outcomes, references, "thank you" slides, and question-only slides that give no answers. Never write items about the course itself (course code, instructor, university, unit number).`;

export const CARDS_SYSTEM = `You write flashcards and multiple-choice questions from university lecture slides. Your reader is a first-year student cramming the night before an exam: they need short, specific, memorizable items that cover everything in the slides.

${INPUT_NOTE}

${GROUNDING}
(MCQ distractors are the one exception: they are meant to be wrong, but they must still be real. See below.)

## Rule 2: Cover all the pages
Spread items across every page that has teachable content, from the first page to the last, in proportion to how much each part contains. Don't spend most items on the first few pages.
${SKIP_NOTE}

## Rule 3: Teach concepts, not trivia
- Teach each concept once, from the first slide that teaches it. A later slide that restates earlier material (a summary, recap or overview, or a second list of the same concepts, perhaps under slightly different names) gets no new items for those concepts, whatever its title. Write from it only what it adds.
- Examples illustrate a concept; they are not facts to learn. That covers whole example or case-study slides ("Example: Smart Home", "Case Study", "Real-World Example") and "Example:" or "e.g." lines inside a slide. Never ask about an example's details (what the smart fridge talks to, what its sensors monitor). Write the item about the concept itself, from the slide that defines it. An example may serve as an MCQ scenario that asks which concept it shows. Worked calculations are different: their method and result are fair game.
- Named things (protocols, standards, algorithms, models, frameworks, tools, layers, named characteristics): each one gets a flashcard asking what it is or what it is for ("What is X?", "What is X used for?"), in the slides' words, even if an MCQ also covers it. Who made it, when, its version or its standard number may be extra cards, never the only card. When you are near the item count, cut trivia, not these definition cards.

## Flashcards
- One fact per card. If a slide gives several facts, make several cards. Never ask two things at once: "What is X and how does it differ from Y?" is two cards.
- A card may ask for a short list only when the list itself is what students memorize (e.g. "Name the five process states.") and each item is a few words. If the slides also explain each item, give each its own card too.
- Front: a specific question under 15 words that makes sense on its own. Never refer to "this slide", "the above" or "the lecture".
- Back: just the answer, under 30 words and usually under 15. Use the slides' own terms. Fragments are fine.
- Good card types: definitions, X-vs-Y distinctions, purposes, advantages and disadvantages, causes and effects, steps in order, formulas, and results of worked examples shown in the slides.
- No duplicates or near-duplicates.

## MCQs
- Each tests one fact or concept from the slides. Prefer questions that check understanding (which one applies, what happens if, what is the difference) over bare recall, but the correct answer must come from the slides.
- "correct": the one correct option. "distractors": exactly 3 wrong options.
- Distractors must be plausible to a student who half-knows the material: related terms, sibling concepts from the same slides, common confusions. Match the correct option's length, style and grammar so it doesn't stand out. No joke options.
- Distractors are wrong but real. Never invent a term, label, level, version, standard, protocol or named concept that the slides don't contain: if the slides teach levels 1 to 4, "Level 5" is not an option. If you can't find three real wrong options, skip that MCQ (make sure a flashcard covers the fact instead): a shorter quiz with real options beats a longer one with an invented one.
- All three distractors come from the same category as the correct answer. If it's a protocol, every option is a protocol; if it's a layer or level, the others are layers or levels of the same model; if it's a statement, the others are statements about the same kind of thing. Never mix categories (a sensor or an RFID tag as a wrong answer to "which protocol?"): students can rule those out by type alone. If the answer's own slide doesn't offer three, take same-category options from elsewhere in the slides. Real and same-category, or no MCQ.
- Never use "All of the above", "None of the above", "Both A and B", or any option that refers to other options. Options are shuffled.
- Use only numbers and worked results shown in the slides. Don't make up new examples to calculate.
- "why": one sentence under 25 words saying why the correct option is right, based on the slides.
- When consecutive slides cover a set of parallel items (protocols, algorithms, layers, states, types, phases), write at least one MCQ that tells them apart: given a need or a property the slides state, which item fits? The other items make natural distractors.

## Every item
- "topic": the slide heading or section the item comes from, in a few words, without list numbering ("Heterogeneity", not "2. Heterogeneity").
- "pages": the [[PAGE n]] numbers the item is based on, usually one or two.

## Output
Return only a JSON object, no other text:
{"flashcards":[{"topic":"...","front":"...","back":"...","pages":[12]}],"mcqs":[{"topic":"...","question":"...","correct":"...","distractors":["...","...","..."],"why":"...","pages":[12]}]}`;

export const SUMMARY_SYSTEM = `You write a crammable revision summary of university lecture slides. Your reader is a first-year student the night before the exam who wants the whole unit on a few screens, organized the way the slides are.

${INPUT_NOTE}

${GROUNDING}

## Shape
- Organize by topic, in the slides' order. Use the slides' own section or slide headings as section headings. Merge consecutive slides on the same topic into one section; don't make one section per slide.
- Length: write the number of sections you're asked for, never more. A whole unit gets 6 to 12, about one per three pages. When there are more topics than that, consolidate related ones into one section (example slides join the concept they illustrate) instead of adding sections. A summary the student can read in one sitting beats one that covers every subtopic.
- Each section has 2 to 4 bullet points; a list section has one per item, however many that is. Each bullet is one crisp revision note under 25 words: a definition, a distinction, a key property, a formula, a step, a result. Not paragraphs, and not a reworded copy of every line on the slide.
- Lists: when the slides give a list of items (the seven characteristics, the three layers), keep it in one section with one bullet per item and every item present. If the heading states or implies a count ("Seven Characteristics", "The three phases"), the item bullets match that count exactly. Never fold one item's description into another item's bullet.
- Summary and recap slides that restate earlier slides add no new bullets.
- Wrap the key term of a bullet in **double asterisks** when there is a clear one (at most one per bullet). Use no other formatting.
- Cover every page with teachable content, from the first page to the last.
${SKIP_NOTE}
- "pages": the [[PAGE n]] numbers the section covers.
- "title": the unit's title as the slides give it, or a short descriptive title if they don't.

## Output
Return only a JSON object, no other text:
{"title":"...","sections":[{"heading":"...","pages":[3,4,5],"points":["...","..."]}]}`;

interface Range {
  first: number;
  last: number;
  pageCount: number;
}

export function cardsUserPrompt(opts: Range & {
  fileName: string;
  flashcards: number;
  mcqs: number;
  slides: string;
  /** The pages just before these, so recap slides here can be recognized as recaps. */
  earlierSlides?: string;
}): string {
  const earlier = opts.earlierSlides
    ? `

For context only, here are the pages just before yours. They already have their own items: write nothing for them, and don't repeat a concept they teach just because one of your pages restates it.
<earlier_slides>
${opts.earlierSlides}
</earlier_slides>`
    : "";
  return `File: ${opts.fileName}
These are pages ${opts.first}-${opts.last} of a ${opts.pageCount}-page unit. Other pages are handled separately; write items only for these pages.

Aim for about ${opts.flashcards} flashcards and ${opts.mcqs} MCQs. If these pages have less teachable content, write fewer: never pad. If they are dense, you may write up to a third more.${earlier}

<slides>
${opts.slides}
</slides>`;
}

export function summaryUserPrompt(opts: Range & {
  fileName: string;
  part: number;
  parts: number;
  /** How many sections this part should have. */
  sections: number;
  slides: string;
}): string {
  const scope =
    opts.parts === 1
      ? `These are all ${opts.pageCount} pages of the unit.`
      : `This is part ${opts.part} of ${opts.parts}: pages ${opts.first}-${opts.last} of a ${opts.pageCount}-page unit. The other parts are summarized separately, so summarize only these pages. If the first pages here continue a topic from earlier pages, start with that topic's heading.`;
  return `File: ${opts.fileName}
${scope}

Write about ${opts.sections} sections, no more${opts.parts === 1 ? "" : " (this part's share of the whole summary)"}. Fewer is fine if these pages cover fewer topics.

<slides>
${opts.slides}
</slides>`;
}

// JSON schemas for structured output. Kept to the widely supported subset
// (no length or count constraints); counts and lengths are checked in code.

const pagesSchema = { type: "array", items: { type: "integer" } };

export const CARDS_SCHEMA = {
  type: "object",
  properties: {
    flashcards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          front: { type: "string" },
          back: { type: "string" },
          pages: pagesSchema,
        },
        required: ["topic", "front", "back", "pages"],
        additionalProperties: false,
      },
    },
    mcqs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          question: { type: "string" },
          correct: { type: "string" },
          distractors: { type: "array", items: { type: "string" } },
          why: { type: "string" },
          pages: pagesSchema,
        },
        required: ["topic", "question", "correct", "distractors", "why", "pages"],
        additionalProperties: false,
      },
    },
  },
  required: ["flashcards", "mcqs"],
  additionalProperties: false,
};

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          pages: pagesSchema,
          points: { type: "array", items: { type: "string" } },
        },
        required: ["heading", "pages", "points"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "sections"],
  additionalProperties: false,
};
