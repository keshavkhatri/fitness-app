// A small PNG toolkit with no dependencies (Node's zlib only): decode, Lanczos resize, masks, compositing, encode.
// Used by scripts/generate-brand-assets.mjs. Pixels are RGBA, 8 bits per channel, in a Uint8ClampedArray.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function createImage(width, height, fill = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { width, height, data };
}

/** Decodes an 8-bit, non-interlaced greyscale, RGB, RGBA or palette-free PNG into RGBA. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG file.');
  }
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  for (let pos = 8; pos < buffer.length; ) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
      if (body[8] !== 8 || body[12] !== 0 || ![0, 2, 6].includes(colorType)) {
        throw new Error('Only 8-bit, non-interlaced greyscale, RGB or RGBA PNGs are supported.');
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 6: 4 }[colorType];
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      let value = raw[src + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[y * stride + x] = value & 255;
    }
  }
  const image = createImage(width, height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (channels === 1) {
      image.data[o] = image.data[o + 1] = image.data[o + 2] = rows[i];
      image.data[o + 3] = 255;
    } else {
      image.data[o] = rows[i * channels];
      image.data[o + 1] = rows[i * channels + 1];
      image.data[o + 2] = rows[i * channels + 2];
      image.data[o + 3] = channels === 4 ? rows[i * channels + 3] : 255;
    }
  }
  return image;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** Encodes as RGB when fully opaque (smaller), otherwise RGBA; picks the best filter per row. */
export function encodePng({ width, height, data }) {
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < channels; c++) pixels[i * channels + c] = data[i * 4 + c];
  }
  const out = Buffer.alloc((stride + 1) * height);
  const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    let best = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const raw = pixels[y * stride + x];
        const a = x >= channels ? pixels[y * stride + x - channels] : 0;
        const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
        const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
        let predicted = 0;
        if (filter === 1) predicted = a;
        else if (filter === 2) predicted = b;
        else if (filter === 3) predicted = (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const value = (raw - predicted) & 255;
        candidates[filter][x] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        best = filter;
      }
    }
    out[y * (stride + 1)] = best;
    candidates[best].copy(out, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const lanczos = (x) => {
  if (x === 0) return 1;
  if (Math.abs(x) >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
};

/** Weights for one axis: for every output index, the first source index and its normalised kernel weights. */
function axisWeights(srcStart, srcSize, srcLimit, outSize) {
  const scale = srcSize / outSize;
  const stretch = Math.max(1, scale);
  const support = 3 * stretch;
  return Array.from({ length: outSize }, (_, i) => {
    const center = srcStart + (i + 0.5) * scale;
    const first = Math.max(0, Math.floor(center - support));
    const last = Math.min(srcLimit - 1, Math.ceil(center + support));
    const weights = [];
    let sum = 0;
    for (let s = first; s <= last; s++) {
      const w = lanczos((s + 0.5 - center) / stretch);
      weights.push(w);
      sum += w;
    }
    return { first, weights: weights.map((w) => w / sum) };
  });
}

/** Resamples the source rectangle (default: the whole image) to width x height with a Lanczos-3 filter (premultiplied alpha). */
export function resize(image, width, height, rect = { x: 0, y: 0, width: image.width, height: image.height }) {
  const wx = axisWeights(rect.x, rect.width, image.width, width);
  const wy = axisWeights(rect.y, rect.height, image.height, height);
  const premultiplied = new Float32Array(image.width * image.height * 4);
  for (let i = 0; i < image.width * image.height; i++) {
    const a = image.data[i * 4 + 3] / 255;
    premultiplied[i * 4] = image.data[i * 4] * a;
    premultiplied[i * 4 + 1] = image.data[i * 4 + 1] * a;
    premultiplied[i * 4 + 2] = image.data[i * 4 + 2] * a;
    premultiplied[i * 4 + 3] = a;
  }
  const horizontal = new Float32Array(width * image.height * 4);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < width; x++) {
      const { first, weights } = wx[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < weights.length; k++) {
        const o = (y * image.width + first + k) * 4;
        r += premultiplied[o] * weights[k];
        g += premultiplied[o + 1] * weights[k];
        b += premultiplied[o + 2] * weights[k];
        a += premultiplied[o + 3] * weights[k];
      }
      const o = (y * width + x) * 4;
      horizontal[o] = r;
      horizontal[o + 1] = g;
      horizontal[o + 2] = b;
      horizontal[o + 3] = a;
    }
  }
  const out = createImage(width, height);
  for (let y = 0; y < height; y++) {
    const { first, weights } = wy[y];
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < weights.length; k++) {
        const o = ((first + k) * width + x) * 4;
        r += horizontal[o] * weights[k];
        g += horizontal[o + 1] * weights[k];
        b += horizontal[o + 2] * weights[k];
        a += horizontal[o + 3] * weights[k];
      }
      const o = (y * width + x) * 4;
      const alpha = Math.min(1, Math.max(0, a));
      out.data[o] = alpha > 0 ? r / alpha : 0;
      out.data[o + 1] = alpha > 0 ? g / alpha : 0;
      out.data[o + 2] = alpha > 0 ? b / alpha : 0;
      out.data[o + 3] = alpha * 255;
    }
  }
  return out;
}

/** Multiplies the image's alpha by a coverage function (x, y in pixel centres) returning 0..1. */
export function applyMask(image, coverage) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const o = (y * image.width + x) * 4 + 3;
      image.data[o] = image.data[o] * coverage(x + 0.5, y + 0.5);
    }
  }
  return image;
}

const edge = (distance) => Math.min(1, Math.max(0, 0.5 - distance));

/** Anti-aliased circle of the given diameter filling a width x height image. */
export const circleCoverage = (width, height) => {
  const radius = Math.min(width, height) / 2;
  return (x, y) => edge(Math.hypot(x - width / 2, y - height / 2) - radius);
};

/** Anti-aliased rounded rectangle (corner radius in pixels). */
export const roundedRectCoverage = (width, height, radius) => (x, y) => {
  const dx = Math.abs(x - width / 2) - (width / 2 - radius);
  const dy = Math.abs(y - height / 2) - (height / 2 - radius);
  return edge(Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius);
};

/** Draws `top` onto `base` at (x, y) with source-over blending; `base` is modified. */
export function compose(base, top, x = 0, y = 0) {
  for (let ty = 0; ty < top.height; ty++) {
    const by = ty + y;
    if (by < 0 || by >= base.height) continue;
    for (let tx = 0; tx < top.width; tx++) {
      const bx = tx + x;
      if (bx < 0 || bx >= base.width) continue;
      const t = (ty * top.width + tx) * 4;
      const b = (by * base.width + bx) * 4;
      const ta = top.data[t + 3] / 255;
      const ba = base.data[b + 3] / 255;
      const outA = ta + ba * (1 - ta);
      if (outA === 0) continue;
      for (let c = 0; c < 3; c++) {
        base.data[b + c] = (top.data[t + c] * ta + base.data[b + c] * ba * (1 - ta)) / outA;
      }
      base.data[b + 3] = outA * 255;
    }
  }
  return base;
}

/** Mean colour of a rectangle (RGB). */
export function averageColor(image, x0, y0, x1, y1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(image.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(image.width, Math.ceil(x1)); x++) {
      const o = (y * image.width + x) * 4;
      r += image.data[o];
      g += image.data[o + 1];
      b += image.data[o + 2];
      n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

export const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
