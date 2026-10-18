// Generates every StokeForm icon and splash raster from the SVG mark in src/assets/brand/stokeform-mark.svg.
//
//   node scripts/generate-brand-assets.mjs
//
// Uses headless Chrome to rasterize (no extra dependencies). Set CHROME_PATH if Chrome is not in a standard place.
// Writes: the web favicon, the Android launcher icons (legacy square, round, adaptive foreground), the Android
// splash images in every density and orientation, and the Android adaptive-icon vector/colour resources.
// It overwrites only those files. The application ID, signing and manifest are not touched.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#151714';
const WARM_BG = '#F5F4EE';
const RES = join(ROOT, 'android/app/src/main/res');

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!chrome) {
  throw new Error('Chrome not found: set CHROME_PATH to chrome.exe (it is only used to turn the SVG into PNGs).');
}

// The artwork: the <g id="mark"> group of the SVG (it carries its own centring transform).
const markSvg = readFileSync(join(ROOT, 'src/assets/brand/stokeform-mark.svg'), 'utf8');
const mark = /<g id="mark"[^>]*>([\s\S]*?)<\/g>/.exec(markSvg)?.[0];
if (!mark) {
  throw new Error('src/assets/brand/stokeform-mark.svg has no <g id="mark"> group.');
}
const centered = (scale) => `<g transform="translate(54 54) scale(${scale}) translate(-54 -54)">${mark}</g>`;

/** A 108 x 108 canvas drawing. */
const drawings = {
  // Legacy launcher icon: the ink tile with rounded corners (transparent outside).
  tile: `<rect width="108" height="108" rx="24" fill="${INK}"/>${mark}`,
  // Round launcher icon: the ink circle.
  round: `<circle cx="54" cy="54" r="54" fill="${INK}"/>${centered(0.92)}`,
  // Adaptive icon foreground: the mark only, inside the 66 dp safe zone (the system draws the background colour).
  foreground: centered(0.72),
};

function rasterize(file, width, height, body) {
  const out = join(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), 'stokeform-brand-'));
  const html = join(dir, 'page.html');
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style></head><body>${body}</body></html>`);
  const result = spawnSync(
    chrome,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000', `--window-size=${width},${height}`, `--screenshot=${out}`, pathToFileURL(html).href],
    { encoding: 'utf8' },
  );
  rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0 || !existsSync(out)) {
    throw new Error(`Chrome failed for ${file}: ${(result.stderr ?? '').slice(0, 200)}`);
  }
  console.log(`  ${file}  ${width}x${height}`);
}
const square = (file, size, drawing) =>
  rasterize(file, size, size, `<svg width="${size}" height="${size}" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">${drawing}</svg>`);

console.log('Web');
square('src/assets/icon/favicon.png', 64, drawings.tile);

console.log('Android launcher icons');
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(LAUNCHER)) {
  square(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size, drawings.tile);
  square(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, size, drawings.round);
  // The adaptive foreground is 108 dp: 1.0x to 4.0x the launcher size's 48 dp base.
  square(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, Math.round((size / 48) * 108), drawings.foreground);
}

console.log('Android splash');
const SPLASH = {
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  drawable: [480, 320],
};
for (const [folder, [w, h]] of Object.entries(SPLASH)) {
  const tile = Math.round(Math.min(w, h) * 0.3);
  const x = Math.round((w - tile) / 2);
  const y = Math.round((h - tile) / 2);
  rasterize(
    `android/app/src/main/res/${folder}/splash.png`,
    w,
    h,
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="${WARM_BG}"/><svg x="${x}" y="${y}" width="${tile}" height="${tile}" viewBox="0 0 108 108">${drawings.tile}</svg></svg>`,
  );
}

console.log('Android adaptive-icon resources');
const write = (file, content) => {
  writeFileSync(join(ROOT, file), content);
  console.log(`  ${file}`);
};
write('android/app/src/main/res/values/ic_launcher_background.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${INK}</color>\n</resources>\n`);
write(
  'android/app/src/main/res/drawable/ic_launcher_background.xml',
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportHeight="108"\n    android:viewportWidth="108">\n    <path\n        android:fillColor="${INK}"\n        android:pathData="M0,0h108v108h-108z" />\n</vector>\n`,
);
// The same mark as a vector (the SVG's stroke and spark, centred and scaled like the PNG foreground).
write(
  'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml',
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportHeight="108"\n    android:viewportWidth="108">\n    <group\n        android:pivotX="54"\n        android:pivotY="54"\n        android:scaleX="0.72"\n        android:scaleY="0.72">\n        <group\n            android:translateX="-7"\n            android:translateY="3">\n            <path\n                android:fillColor="#00000000"\n                android:pathData="M68,34C61,25 38,26 38,41C38,57 68,52 68,69C68,86 44,87 35,77"\n                android:strokeColor="#C5F36B"\n                android:strokeLineCap="round"\n                android:strokeLineJoin="round"\n                android:strokeWidth="13.5" />\n            <path\n                android:fillColor="#C5F36B"\n                android:pathData="M83,15l3.2,8.3 8.3,3.2 -8.3,3.2L83,38l-3.2,-8.3 -8.3,-3.2 8.3,-3.2z" />\n        </group>\n    </group>\n</vector>\n`,
);
console.log('Done. Review the images, then `npx cap sync android` and rebuild the APK.');
