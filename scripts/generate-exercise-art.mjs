// Generates the original start-position exercise illustrations with the OpenAI image API.
//
//   node --env-file-if-exists=server/.env scripts/generate-exercise-art.mjs [exercise-id ...]   (or: npm run exercise-art)
//
// Needs OPENAI_API_KEY in the environment or the ignored server/.env (never printed, never shipped). Calls cost money,
// so it only makes requests for the ids named (default: the three proof-of-concept exercises) and writes
// src/assets/exercise-art/<id>-guide.webp. OPENAI_IMAGE_MODEL overrides the model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTRA_EXERCISES } from './exercise-art-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/assets/exercise-art');
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const RETRIES = 2;

// Names and primary muscles are those of src/app/domain/workout-programming/exercise-library.ts.
const EXERCISES = {
  'dumbbell-lateral-raise': {
    name: 'Lateral Raise',
    muscles: 'Lateral (side) deltoid',
    equipment: 'two plain black dumbbells',
    start: 'standing upright, feet hip-width apart, a dumbbell held naturally at each side of the thighs, elbows slightly bent',
    mid: 'both arms raised outward to the sides about half way up, elbows slightly bent, dumbbells level with the hips-to-ribs',
    finish: 'both arms raised out to the sides to approximately shoulder height (not overhead), elbows slightly bent, torso upright',
    arrows: 'solid dark arrows beside each hand pointing up and OUTWARD away from the body for the lift (between the start and midpoint figures and between the midpoint and finish figures), and a thin dashed arrow showing the slow controlled return down. Keep every dumbbell fully inside the image with a margin, never cropped by a panel edge',
    cues: ['Lift with control, no swinging', 'Keep a slight bend in the elbows', 'Do not shrug your shoulders'],
    breathing: 'Breathe out as you lift, in as you lower',
    panel: 'close-up of the shoulder with the lateral deltoid highlighted, plus a small back view with both lateral deltoids highlighted',
  },
  'lat-pulldown': {
    name: 'Lat Pulldown',
    muscles: 'Latissimus dorsi (lats)',
    equipment: 'a dark grey lat-pulldown machine with seat, thigh pads, overhead pulley, cable and wide bar',
    start: 'seated securely at the machine with thighs under the pads, torso upright, arms extended overhead holding the wide bar',
    mid: 'seated the same way, elbows bending and moving down and outward as the bar travels down in front of the face',
    finish: 'bar pulled down to the upper chest, elbows down by the ribs, chest lifted, torso slightly leaning back, controlled posture',
    arrows: 'a downward arrow beside the bar for the pull, and a thin dashed upward arrow for the slow return',
    cues: ['Pull the bar to your upper chest', 'Drive elbows down and back', 'Keep your chest up, no swinging'],
    breathing: 'Breathe out as you pull down, in as you return',
    panel: 'a back view of the torso with both latissimus dorsi muscles highlighted',
  },
  'back-squat': {
    name: 'Back Squat',
    muscles: 'Quadriceps and glutes',
    equipment: 'a black barbell with grey plates resting on a plain dark squat rack',
    start: 'standing tall, the bar resting securely across the upper back (on the traps, not the neck), hands gripping the bar, feet shoulder-width apart',
    mid: 'descending, hips moving back and knees bending to roughly half depth, chest up, bar over the mid-foot',
    finish: 'the bottom of the squat with thighs about parallel to the floor, knees tracking over the toes, back flat, bar still over the mid-foot',
    arrows: 'a downward arrow for the descent and an upward arrow for the drive back up',
    cues: ['Brace your core before you descend', 'Knees track over your toes', 'Drive up through your whole foot'],
    breathing: 'Breathe in on the way down, out as you stand',
    panel: 'a small front view with the quadriceps highlighted and a small back view with the glutes highlighted',
  },
};

Object.assign(EXERCISES, Object.fromEntries(Object.entries(EXTRA_EXERCISES).filter(([id]) => !(id in EXERCISES))));

const prompt = (e) => `A polished instructional exercise graphic for a mobile fitness app, landscape, in the style of a premium anatomy app.

Layout (clean, generous spacing, rounded light panels):
- Top-left: the title "${e.name}" in bold dark sans-serif type, and under it a small orange-red dot with the label "Primary muscle: ${e.muscles}".
- Main area: three large figures of the SAME anatomical 3D-style athletic male figure (same body, same lighting, same camera angle) performing a ${e.name} with ${e.equipment}, left to right, in this order, with NO text labels above or below them:
  1) ${e.start}.
  2) ${e.mid}.
  3) ${e.finish}.
- Between the figures, clear arrows showing the direction of movement: ${e.arrows}. Arrows are simple, dark grey, and uncluttered.
- Right-hand column of small rounded panels: ${e.panel}, each with a short label.
- Bottom strip: three short form cues (${e.cues.map((c) => `"${c}"`).join(', ')}) and the breathing cue "${e.breathing}", in large legible type.

Style: detailed grayscale muscle anatomy, soft studio lighting, flat warm off-white background (#F5F4EE). Only the primary muscles (${e.muscles}) are highlighted in orange-red (#E8502A); every other muscle stays grayscale. Equipment is dark neutral grey or black with no branding. Text must be spelled exactly as given, crisp, and large enough to read on a phone. No watermarks or logos. Anatomically plausible, safe, correct form.`;

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is not set. Add OPENAI_API_KEY=... to server/.env (git-ignored) or export it, then rerun.');
  process.exit(1);
}
const catalog = new Set([...readFileSync(join(ROOT, 'src/app/domain/workout-programming/exercise-library.ts'), 'utf8').matchAll(/^ {2}exercise\(['"]([^'"]+)['"]/gm)].map((m) => m[1]));
const outFile = (id) => join(OUT, `${id}-guide.webp`);
const unlisted = Object.keys(EXERCISES).filter((id) => !catalog.has(id));
if (unlisted.length) {
  console.error(`Not in the exercise catalog: ${unlisted.join(', ')}`);
  process.exit(1);
}
// Named ids are (re)generated; with none named, every configured exercise that has no guide yet.
const named = process.argv.slice(2);
const unknown = named.filter((id) => !Object.hasOwn(EXERCISES, id));
if (unknown.length) {
  console.error(`Not configured for generation: ${unknown.join(', ')}`);
  process.exit(1);
}
const ids = named.length ? named : Object.keys(EXERCISES).filter((id) => !existsSync(outFile(id)));
const CONCURRENCY = 4;

mkdirSync(OUT, { recursive: true });
async function generate(id) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, prompt: prompt(EXERCISES[id]), size: '1536x1024', quality: 'high', output_format: 'webp', output_compression: 85, n: 1 }),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json();
      writeFileSync(outFile(id), Buffer.from(body.data[0].b64_json, 'base64'));
      console.log(`${id}: wrote src/assets/exercise-art/${id}-guide.webp (model ${MODEL})`);
      return true;
    }
    const err = res ? ((await res.json().catch(() => ({}))).error?.message ?? res.statusText) : 'network error';
    if (attempt >= RETRIES || (res && res.status < 500 && res.status !== 429)) {
      console.error(`${id}: ${res?.status ?? ''} ${err}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
}
const queue = [...ids];
const failed = [];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let id; (id = queue.shift()); ) {
      if (!(await generate(id))) failed.push(id);
    }
  }),
);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
