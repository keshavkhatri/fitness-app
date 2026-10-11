import { INBODY_REPORT_MEDIA_TYPES, InBodyReportMediaType } from '../../src/app/domain/inbody-extraction';

/**
 * The uploaded report: the raw image bytes as the request body, with
 * `Content-Type: image/png | image/jpeg | image/webp` (the image inputs the
 * Responses API request builder accepts). Read into memory only, never to disk.
 */

export type UploadProblem = 'unsupported-media-type' | 'empty-upload' | 'upload-too-large' | 'invalid-image';

export type UploadResult =
  | { readonly ok: true; readonly mediaType: InBodyReportMediaType; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly problem: UploadProblem };

const isReportMediaType = (value: string): value is InBodyReportMediaType =>
  (INBODY_REPORT_MEDIA_TYPES as readonly string[]).includes(value);

/** `image/png; foo=bar` → `image/png`. */
export function mediaTypeOf(contentType: string | null): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (value: string) => [...value].map((c) => c.charCodeAt(0));

/** Each declared type must carry its own file signature (a renamed file is rejected). */
const SIGNATURES: Readonly<Record<InBodyReportMediaType, (bytes: Uint8Array) => boolean>> = {
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/webp': (bytes) => startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8),
};

/**
 * Reads at most `maxBytes` of the body. A body announced or found to be
 * larger is not read further; nothing read is kept anywhere but the result.
 */
async function readBody(request: Request, maxBytes: number): Promise<Uint8Array | 'too-large'> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return 'too-large';
  }
  if (!request.body) {
    return new Uint8Array(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return 'too-large';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readReportUpload(request: Request, maxBytes: number): Promise<UploadResult> {
  const mediaType = mediaTypeOf(request.headers.get('content-type'));
  if (!isReportMediaType(mediaType)) {
    return { ok: false, problem: 'unsupported-media-type' };
  }
  const bytes = await readBody(request, maxBytes);
  if (bytes === 'too-large') {
    return { ok: false, problem: 'upload-too-large' };
  }
  if (bytes.length === 0) {
    return { ok: false, problem: 'empty-upload' };
  }
  if (!SIGNATURES[mediaType](bytes)) {
    return { ok: false, problem: 'invalid-image' };
  }
  return { ok: true, mediaType, bytes };
}
