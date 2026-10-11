import { Injectable, InjectionToken, inject, isDevMode } from '@angular/core';

import { INBODY_REPORT_MEDIA_TYPES, InBodyExtraction, parseInBodyExtraction } from '../../domain/inbody-extraction';

/**
 * The app's side of `POST /v1/inbody-extractions` (server/): sends one report
 * image to the app's own server, which holds the OpenAI key and calls the
 * model. The key never reaches the app. The answer is re-validated here with
 * `parseInBodyExtraction`: a 200 from the server is not trusted on its own.
 *
 * Privacy: the image is only sent, never stored; nothing here logs the image,
 * the response or its values.
 */

/** Local server (`npm run server:start`) in development; null until production hosting exists. */
const DEV_ENDPOINT = 'http://localhost:8787/v1/inbody-extractions';

/** The extraction endpoint, or null when report upload isn't available in this build. */
export const INBODY_EXTRACTION_ENDPOINT = new InjectionToken<string | null>('INBODY_EXTRACTION_ENDPOINT', {
  providedIn: 'root',
  factory: () => (isDevMode() ? DEV_ENDPOINT : null),
});

/** `fetch`, injectable so tests never reach the network. */
export const INBODY_EXTRACTION_FETCH = new InjectionToken<typeof fetch>('INBODY_EXTRACTION_FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

/** The server's default upload limit (INBODY_MAX_UPLOAD_BYTES): checked before sending. */
export const MAX_REPORT_BYTES = 8 * 1024 * 1024;
/** The server allows the model 90 s; this leaves room for the upload. */
const REQUEST_TIMEOUT_MS = 120_000;

export type ReportFileProblem = 'unsupported-type' | 'too-large' | 'empty';

/** What the app can check about a chosen file before sending it. */
export function checkReportFile(file: { readonly type: string; readonly size: number }): ReportFileProblem | null {
  if (!(INBODY_REPORT_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return 'unsupported-type';
  }
  if (file.size === 0) {
    return 'empty';
  }
  return file.size > MAX_REPORT_BYTES ? 'too-large' : null;
}

/**
 * - unavailable: no endpoint in this build, or the server isn't set up for it;
 * - rejected-file: the server couldn't use the image (type, size, not an image);
 * - busy: too many uploads (this client or the service);
 * - refused: the model declined to read the image;
 * - network: no answer (offline, unreachable, timed out);
 * - service: the server or the model failed;
 * - invalid-response: an answer that isn't a valid `inbody-extraction.v1`.
 */
export type ExtractionFailure =
  | ReportFileProblem
  | 'unavailable'
  | 'rejected-file'
  | 'busy'
  | 'refused'
  | 'network'
  | 'service'
  | 'invalid-response';

export type ExtractionResult =
  | { readonly ok: true; readonly extraction: InBodyExtraction }
  | { readonly ok: false; readonly failure: ExtractionFailure };

const fail = (failure: ExtractionFailure): ExtractionResult => ({ ok: false, failure });

/** The server's `{ error: { code } }` (see server/src/extraction-handler.ts), else by status. */
function failureOf(status: number, code: unknown): ExtractionFailure {
  switch (code) {
    case 'unsupported-media-type':
    case 'empty-upload':
    case 'upload-too-large':
    case 'invalid-image':
      return 'rejected-file';
    case 'rate-limited':
    case 'service-limit-reached':
      return 'busy';
    case 'not-configured':
    case 'origin-not-allowed':
    case 'not-found':
    case 'method-not-allowed':
      return 'unavailable';
    case 'extraction-refused':
      return 'refused';
    case 'invalid-extraction':
      return 'invalid-response';
  }
  if (status === 400 || status === 413 || status === 415) {
    return 'rejected-file';
  }
  return status === 429 ? 'busy' : 'service';
}

@Injectable({ providedIn: 'root' })
export class InBodyExtractionClient {
  private readonly endpoint = inject(INBODY_EXTRACTION_ENDPOINT);
  private readonly fetch = inject(INBODY_EXTRACTION_FETCH);

  /** False when this build has no extraction endpoint: offer manual entry only. */
  readonly available = this.endpoint !== null;

  async extract(report: Blob): Promise<ExtractionResult> {
    if (this.endpoint === null) {
      return fail('unavailable');
    }
    const problem = checkReportFile(report);
    if (problem) {
      return fail(problem);
    }

    let response: Response;
    try {
      response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': report.type },
        body: report,
        credentials: 'omit',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return fail('network');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return fail(response.ok ? 'invalid-response' : failureOf(response.status, null));
    }
    if (!response.ok) {
      const error = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['error'] : null;
      const code = typeof error === 'object' && error !== null ? (error as Record<string, unknown>)['code'] : null;
      return fail(failureOf(response.status, code));
    }
    const parsed = parseInBodyExtraction(body);
    return parsed.ok ? { ok: true, extraction: parsed.value } : fail('invalid-response');
  }
}
