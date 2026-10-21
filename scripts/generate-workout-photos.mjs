// Generates the workout photography (session heroes and exercise photos) with the OpenAI image API.
//
//   node --env-file-if-exists=server/.env scripts/generate-workout-photos.mjs [session:<type> | workout-complete | <exercise-id> ...]
//   (or: npm run workout-photos -- ...)
//
// Needs OPENAI_API_KEY in the environment or the ignored server/.env (never printed, never shipped). Calls cost money,
// so with no arguments it only generates what is missing. Writes src/assets/images/workouts/session-<type>.webp and
// src/assets/images/workouts/exercises/<id>.webp. OPENAI_IMAGE_MODEL overrides the model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTRA_EXERCISES } from './exercise-art-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/assets/images/workouts');
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const RETRIES = 2;
const CONCURRENCY = 4;

// The same athlete and gym in every photo, so the app reads as one shoot.
const ATHLETE =
  'one athletic man in his late twenties with short dark hair and a short trimmed dark beard, wearing a plain black sleeveless tank top, black training shorts and black sneakers (no logos)';
const LOOK =
  'Photorealistic editorial fitness photography in a dark, premium gym: low-key moody lighting, a warm key light from above-right and a soft rim light, deep charcoal shadows, blurred dumbbell racks and black equipment in the background, shallow depth of field, subtle film grain, natural skin texture, realistic anatomy. No text, no logos, no watermarks, no mirrors, no other people.';

const SESSIONS = {
  'full-body': 'standing tall holding a heavy dumbbell in each hand at his sides, mid-set in a farmer carry, focused expression',
  upper: 'seated on a flat bench doing a dumbbell shoulder press, both dumbbells pressed overhead, focused expression',
  lower: 'at the bottom of a barbell back squat in a squat rack, bar across the upper back, chest up',
  push: 'lying on a flat bench pressing two dumbbells up above the chest (dumbbell bench press), head turned slightly toward the camera',
  pull: 'at the top of a pull-up on a black pull-up bar, chin above the bar, back muscles engaged',
  legs: 'in a deep dumbbell reverse lunge, a dumbbell in each hand, torso upright',
  'light-activity': 'walking briskly on a treadmill, relaxed and upright, slight smile',
  'optional-conditioning': 'pulling on a black rowing machine at the finish of the stroke, handle at the lower ribs',
};

// The three hand-configured guide-sheet exercises (scripts/generate-exercise-art.mjs) plus the generated table.
const EXERCISES = {
  'dumbbell-lateral-raise': { name: 'Lateral Raise', equipment: 'two black dumbbells', mid: 'standing upright, both arms raised out to the sides to shoulder height with a slight bend in the elbows' },
  'lat-pulldown': { name: 'Lat Pulldown', equipment: 'a black lat-pulldown machine with a wide bar', mid: 'seated with thighs under the pads, pulling the wide bar down to the upper chest, elbows driving down' },
  'back-squat': { name: 'Back Squat', equipment: 'a barbell on a black squat rack', mid: 'half way down a barbell back squat, bar across the upper back, chest up, knees over the toes' },
  ...EXTRA_EXERCISES,
};

const sessionPrompt = (pose) => `${LOOK}

Subject: ${ATHLETE}, ${pose}. Wide landscape composition for a mobile app card: place the athlete in the RIGHT half of the frame, leaving the left half and the bottom third darker and uncluttered for overlaid text. The whole movement is visible, nothing important is cropped.`;

const exercisePrompt = (e) => `${LOOK}

Subject: ${ATHLETE}, performing a ${e.name} with ${e.equipment}, captured mid-repetition with correct, safe form: ${e.mid}. Landscape composition with the athlete and the equipment CENTRED, so that a centred square crop still shows the movement clearly; seen from a three-quarter side angle that makes the exercise easy to recognise.`;

// One-off photos (the workout summary's card).
const EXTRAS = {
  'rest-day': 'sitting on a black exercise mat on the gym floor, gently rolling a calf over a black foam roller, relaxed recovery-day posture, calm expression, a small dark towel beside him',
  'workout-complete': 'resting after his workout with a small dark towel over one shoulder, holding a dumbbell low at his side, looking down with a satisfied, tired expression, light sweat',
};

// Onboarding (src/assets/images/onboarding/): the welcome portrait and the goal and training-location cards.
const ONBOARDING_DIR = join(ROOT, 'src/assets/images/onboarding');
const thumb = (subject) => `${LOOK}

Subject: ${subject}. Landscape composition with the subject centred and filling most of the frame, so it reads clearly as a small rounded thumbnail.`;
const ONBOARDING = {
  welcome: {
    size: '1024x1536',
    prompt: `${LOOK}

Subject: ${ATHLETE}, standing side-on in three-quarter view, holding a dumbbell at his side, looking down and to the side with a focused expression. Tall portrait composition for a phone welcome screen: his head and shoulders in the upper half of the frame, the lower half falling into deep shadow so white text can sit there.`,
  },
  'goal-recomposition': { prompt: thumb(`${ATHLETE}, lean and muscular, mid-way through a dumbbell curl, upper body and arms in frame`) },
  'goal-lose-fat': { prompt: thumb(`${ATHLETE}, mid-jump with a skipping rope, energetic`) },
  'goal-build-muscle': { prompt: thumb(`${ATHLETE}, seated on a bench lifting a heavy dumbbell in a concentration curl, close framing`) },
  'goal-get-stronger': { prompt: thumb(`${ATHLETE}, at the top of a heavy barbell deadlift with large black plates`) },
  'goal-improve-fitness': { prompt: thumb(`${ATHLETE}, mid kettlebell swing, kettlebell at chest height`) },
  'location-gym': { prompt: thumb('no people: a row of black dumbbells on a rack in front of a squat rack with a loaded barbell') },
  'location-home': {
    prompt: `Photorealistic editorial photography of a calm, modern living room at home in warm evening light: a pair of black dumbbells and a rolled exercise mat on a wooden floor next to a sofa. No people, no text, no logos.`,
  },
  'avatar-male': { size: '1024x1024', prompt: `A friendly 3D cartoon avatar bust for a fitness app's profile picker: a man in his late twenties with short dark hair and a short trimmed dark beard, wearing a black t-shirt, soft clay-like 3D render, smooth shading, gentle smile, centred head and shoulders, plain warm off-white background (#F5F4EE). No text, no logos, no frame.` },
  'avatar-female': { size: '1024x1024', prompt: `A friendly 3D cartoon avatar bust for a fitness app's profile picker: a woman in her late twenties with long dark hair in a low ponytail, wearing a black t-shirt, soft clay-like 3D render, smooth shading, gentle smile, centred head and shoulders, plain warm off-white background (#F5F4EE). No text, no logos, no frame.` },
  'avatar-neutral': { size: '1024x1024', prompt: `A friendly 3D cartoon avatar bust for a fitness app's profile picker: a simple gender-neutral person silhouette with short hair, in soft grey tones, wearing a black t-shirt, soft clay-like 3D render, smooth shading, gentle smile, centred head and shoulders, plain warm off-white background (#F5F4EE). No text, no logos, no frame.` },
  'offer-hero': {
    size: '1536x1024',
    prompt: `${LOOK}

Subject: ${ATHLETE}, seen from behind and slightly to the side, gripping a loaded barbell on a rack, ready to lift. Wide landscape banner for the top of a subscription screen: the athlete on the RIGHT third of the frame; the left two thirds very dark and empty for white headline text. A thin, glowing lime-green (#C6F36B) light streak sweeps in a smooth curve across the upper right corner. Very low-key, mostly black.`,
  },
  'height-figure': {
    size: '1024x1536',
    background: 'transparent',
    prompt: `A smooth, neutral light-grey 3D mannequin figure standing straight in a relaxed anatomical pose, front view, full body from head to feet, arms slightly away from the sides, no facial features, soft studio shading, matte material. Centred, the whole figure visible with a small margin, on a fully transparent background. No text, no floor, no shadow, no logos.`,
  },
  'location-both': { prompt: thumb(`${ATHLETE}, at home in a living room with warm light, doing a resistance-band row anchored to a door, a pair of dumbbells on the floor`) },
};

const jobs = {
  ...Object.fromEntries(Object.entries(ONBOARDING).map(([name, job]) => [`onboarding:${name}`, { file: join(ONBOARDING_DIR, `${name}.webp`), ...job }])),
  ...Object.fromEntries(Object.entries(EXTRAS).map(([name, pose]) => [name, { file: join(OUT, `${name}.webp`), prompt: sessionPrompt(pose) }])),
  ...Object.fromEntries(Object.entries(SESSIONS).map(([type, pose]) => [`session:${type}`, { file: join(OUT, `session-${type}.webp`), prompt: sessionPrompt(pose) }])),
  ...Object.fromEntries(Object.entries(EXERCISES).map(([id, e]) => [id, { file: join(OUT, 'exercises', `${id}.webp`), prompt: exercisePrompt(e) }])),
};

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is not set. Add OPENAI_API_KEY=... to server/.env (git-ignored) or export it, then rerun.');
  process.exit(1);
}
const catalog = new Set([...readFileSync(join(ROOT, 'src/app/domain/workout-programming/exercise-library.ts'), 'utf8').matchAll(/^ {2}exercise\(['"]([^'"]+)['"]/gm)].map((m) => m[1]));
const unlisted = Object.keys(EXERCISES).filter((id) => !catalog.has(id));
if (unlisted.length) {
  console.error(`Not in the exercise catalog: ${unlisted.join(', ')}`);
  process.exit(1);
}
const named = process.argv.slice(2);
const unknown = named.filter((id) => !Object.hasOwn(jobs, id));
if (unknown.length) {
  console.error(`Unknown: ${unknown.join(', ')} (use session:<type>, onboarding:<name>, workout-complete or an exercise id)`);
  process.exit(1);
}
const ids = named.length ? named : Object.keys(jobs).filter((id) => !existsSync(jobs[id].file));

mkdirSync(join(OUT, 'exercises'), { recursive: true });
mkdirSync(ONBOARDING_DIR, { recursive: true });
async function generate(id) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, prompt: jobs[id].prompt, size: jobs[id].size ?? '1536x1024', ...(jobs[id].background ? { background: jobs[id].background } : {}), quality: 'medium', output_format: 'webp', output_compression: 80, n: 1 }),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json();
      writeFileSync(jobs[id].file, Buffer.from(body.data[0].b64_json, 'base64'));
      console.log(`${id}: wrote ${jobs[id].file.slice(ROOT.length + 1)}`);
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
