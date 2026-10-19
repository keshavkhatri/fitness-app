// Generates every StokeForm app icon and splash raster from the two artwork files in scripts/brand-source/:
//   stokeform-icon.png    1254 x 1254, the app icon
//   stokeform-splash.png   887 x 1774, the launch screen
//
//   node scripts/generate-brand-assets.mjs        (or: npm run brand:assets)
//
// No dependencies: scripts/lib/raster.mjs decodes, resamples (Lanczos) and encodes the PNGs itself.
// Writes the web favicon, the Android launcher icons (legacy square, round, adaptive foreground), the adaptive
// background colour and the Android splash images in every density and orientation. It overwrites only those
// files. The application ID, signing and manifest are not touched.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyMask, averageColor, circleCoverage, compose, createImage, decodePng, encodePng, hex, resize, roundedRectCoverage } from './lib/raster.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RES = 'android/app/src/main/res';

const icon = decodePng(readFileSync(join(ROOT, 'scripts/brand-source/stokeform-icon.png')));
const splash = decodePng(readFileSync(join(ROOT, 'scripts/brand-source/stokeform-splash.png')));

// The icon's dark interior (adaptive icon background) and the splash's edge colour, measured from the artwork.
const ICON_BACKGROUND = averageColor(icon, 60, 300, 140, 900);
const SPLASH_BACKGROUND = averageColor(splash, 0, 560, 6, 1150);

const write = (file, content) => {
  const out = join(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
};
const png = (file, image) => {
  write(file, encodePng(image));
  console.log(`  ${file}  ${image.width}x${image.height}`);
};

/** The artwork without its outer rim and black corners (the source is a squircle on black): `inset` of it is dropped per side. */
const artRect = (inset) => ({ x: icon.width * inset, y: icon.height * inset, width: icon.width * (1 - 2 * inset), height: icon.height * (1 - 2 * inset) });

/** Legacy launcher icon (pre-Android 8, no system mask): the artwork on a rounded square, transparent corners. */
const tile = (size) => applyMask(resize(icon, size, size, artRect(0.03)), roundedRectCoverage(size, size, size * 0.2));
/** Round launcher icon. */
const round = (size) => applyMask(resize(icon, size, size, artRect(0.02)), circleCoverage(size, size));
/**
 * Adaptive icon foreground: a 108 dp layer whose visible window is the middle 72 dp (66 dp is always safe).
 * The artwork, wordmark included, is scaled so its widest points stay inside the 66 dp circle; the system draws
 * the background colour around it.
 */
const foreground = (size) => {
  const layer = createImage(size, size);
  const art = Math.round(size * 0.67);
  return compose(layer, resize(icon, art, art, artRect(0.03)), Math.round((size - art) / 2), Math.round((size - art) / 2));
};

console.log('Web');
png('src/assets/icon/favicon.png', tile(64));
// Browsers prefer the SVG icon listed first in index.html: it carries the same artwork.
write(
  'src/assets/icon/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128" width="128" height="128"><image width="128" height="128" xlink:href="data:image/png;base64,${encodePng(tile(128)).toString('base64')}"/></svg>\n`,
);
console.log('  src/assets/icon/favicon.svg');

console.log('Android launcher icons');
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(LAUNCHER)) {
  png(`${RES}/mipmap-${density}/ic_launcher.png`, tile(size));
  png(`${RES}/mipmap-${density}/ic_launcher_round.png`, round(size));
  // The adaptive foreground is 108 dp: 2.25x the 48 dp launcher size at every density.
  png(`${RES}/mipmap-${density}/ic_launcher_foreground.png`, foreground(Math.round((size / 48) * 108)));
}
write(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${hex(ICON_BACKGROUND)}</color>\n    <color name="splash_background">${hex(SPLASH_BACKGROUND)}</color>\n</resources>\n`,
);
console.log(`  ${RES}/values/ic_launcher_background.xml  (${hex(ICON_BACKGROUND)}, splash ${hex(SPLASH_BACKGROUND)})`);

console.log('Android splash');
/**
 * Portrait: the whole splash artwork at the density's size. Android stretches a plain bitmap background to the screen, so
 * the size is chosen at 1:2, which sits between older 16:9 phones and today's 20:9 ones (at most about 12% either way).
 */
const portrait = (w, h) => resize(splash, w, h);
/**
 * Landscape: the artwork is portrait, so the band holding the logo, wordmark and loading bar is placed on the
 * edge colour of the splash and feathered into it (the green waves live at the top and bottom of the portrait art).
 */
const landscape = (w, h) => {
  const band = { x: 0, y: 540, width: splash.width, height: 650 };
  const bandH = Math.round(h * 0.62);
  const bandW = Math.round((band.width / band.height) * bandH);
  const piece = resize(splash, bandW, bandH, band);
  const feather = { x: bandW * 0.22, y: bandH * 0.16 };
  applyMask(piece, (x, y) => {
    const dx = Math.min(x, bandW - x) / feather.x;
    const dy = Math.min(y, bandH - y) / feather.y;
    const smooth = (t) => (t >= 1 ? 1 : t * t * (3 - 2 * t));
    return smooth(dx) * smooth(dy);
  });
  const canvas = createImage(w, h, [...SPLASH_BACKGROUND, 255]);
  return compose(canvas, piece, Math.round((w - bandW) / 2), Math.round((h - bandH) / 2));
};
const SPLASH_SIZES = {
  'drawable-port-mdpi': [360, 720],
  'drawable-port-hdpi': [540, 1080],
  'drawable-port-xhdpi': [720, 1440],
  'drawable-port-xxhdpi': [1080, 2160],
  // High-density screens are rare before Android 12, which draws its own splash; reuse the xxhdpi size rather than ship ~4 MB more.
  'drawable-port-xxxhdpi': [1080, 2160],
  'drawable-land-mdpi': [720, 360],
  'drawable-land-hdpi': [1080, 540],
  'drawable-land-xhdpi': [1440, 720],
  'drawable-land-xxhdpi': [2160, 1080],
  'drawable-land-xxxhdpi': [2160, 1080],
  drawable: [360, 720],
};
for (const [folder, [w, h]] of Object.entries(SPLASH_SIZES)) {
  png(`${RES}/${folder}/splash.png`, w > h ? landscape(w, h) : portrait(w, h));
}
console.log('Done. Review the images, then `npx cap sync android` and rebuild the APK.');
