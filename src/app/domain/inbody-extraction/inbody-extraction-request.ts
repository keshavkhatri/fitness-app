import {
  ExtractionError,
  INBODY_EXTRACTION_SCHEMA_NAME,
  InBodyExtraction,
  inBodyExtractionJsonSchema,
  parseInBodyExtraction,
} from './inbody-extraction-contract';

/**
 * The OpenAI Responses API exchange for one report, as plain data: the
 * request body to send and the reading of the raw response. For the
 * server-side endpoint that holds the API key; nothing here sends a request,
 * reads a key or logs anything. Never call the API from the app itself.
 *
 * - `store: false`: the API stores responses by default; a report must not be kept.
 * - The model is configuration, not part of the contract.
 * - Image inputs only (PNG, JPEG, WEBP); PDF reports are not supported yet.
 */

export const INBODY_REPORT_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type InBodyReportMediaType = (typeof INBODY_REPORT_MEDIA_TYPES)[number];

export interface InBodyReportImage {
  readonly mediaType: string;
  /** The image bytes, base64-encoded (no data-URL prefix). */
  readonly base64: string;
}

export interface InBodyExtractionRequestOptions {
  readonly model: string;
  readonly maxOutputTokens: number;
}

export const INBODY_EXTRACTION_INSTRUCTIONS = [
  'You transcribe one InBody body-composition result sheet into the given JSON schema. You never interpret, advise or diagnose.',
  'Use outcome "unsupported-report" if the image is not an InBody result sheet, and "insufficient-readable-information" if it is one but no value can be read; then every field is "not-on-report".',
  'For each field, copy the current test\'s value exactly as printed: the digits as text without the unit, and the unit as printed. Never convert, round, calculate or complete a value.',
  'Ignore reference ranges in parentheses, history charts, segmental analysis, evaluations and targets.',
  'If a field is not printed, use status "not-on-report". If it is printed but you cannot read it reliably, use "unreadable" and no value. If you can read it but are not sure, use "uncertain". Never guess.',
  'sourceLabel is the label printed next to the value. Report whole-image problems in reportIssues.',
].join('\n');

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isMediaType = (value: string): value is InBodyReportMediaType => (INBODY_REPORT_MEDIA_TYPES as readonly string[]).includes(value);

export type InBodyExtractionRequestResult =
  | { readonly ok: true; readonly body: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly problem: 'unsupported-media-type' | 'invalid-image' | 'invalid-options' };

/** The `POST /v1/responses` body for one report image. */
export function inBodyExtractionRequest(
  image: InBodyReportImage,
  { model, maxOutputTokens }: InBodyExtractionRequestOptions,
): InBodyExtractionRequestResult {
  if (!isMediaType(image.mediaType)) {
    return { ok: false, problem: 'unsupported-media-type' };
  }
  if (image.base64.length % 4 !== 0 || !BASE64.test(image.base64)) {
    return { ok: false, problem: 'invalid-image' };
  }
  if (model.trim() === '' || !Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    return { ok: false, problem: 'invalid-options' };
  }
  return {
    ok: true,
    body: {
      model,
      store: false,
      instructions: INBODY_EXTRACTION_INSTRUCTIONS,
      max_output_tokens: maxOutputTokens,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: `data:${image.mediaType};base64,${image.base64}`, detail: 'high' }],
        },
      ],
      text: {
        format: { type: 'json_schema', name: INBODY_EXTRACTION_SCHEMA_NAME, strict: true, schema: inBodyExtractionJsonSchema() },
      },
    },
  };
}

/**
 * - extraction: completed, and the output passed `parseInBodyExtraction`;
 * - refused: the model declined (its text is not kept: it may quote the report);
 * - incomplete: stopped early (output may not match the schema, so it is not read);
 * - failed: any other status, or an API error;
 * - invalid-output: completed, but not one JSON text matching the contract
 *   (`errors` locate contract problems; empty when it wasn't JSON at all).
 */
export type InBodyExtractionResponse =
  | { readonly kind: 'extraction'; readonly extraction: InBodyExtraction }
  | { readonly kind: 'refused' }
  | { readonly kind: 'incomplete'; readonly reason: 'max-output-tokens' | 'content-filter' | 'other' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'invalid-output'; readonly errors: readonly ExtractionError[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const INCOMPLETE_REASONS: Readonly<Record<string, 'max-output-tokens' | 'content-filter'>> = {
  max_output_tokens: 'max-output-tokens',
  content_filter: 'content-filter',
};

/** Reads a decoded `/v1/responses` response body. */
export function readInBodyExtractionResponse(response: unknown): InBodyExtractionResponse {
  if (!isRecord(response) || response['error'] != null) {
    return { kind: 'failed' };
  }
  if (response['status'] === 'incomplete') {
    const details = response['incomplete_details'];
    const reason = isRecord(details) && typeof details['reason'] === 'string' ? INCOMPLETE_REASONS[details['reason']] : undefined;
    return { kind: 'incomplete', reason: reason ?? 'other' };
  }
  if (response['status'] !== 'completed' || !Array.isArray(response['output'])) {
    return { kind: 'failed' };
  }
  const content = response['output']
    .filter((item) => isRecord(item) && item['type'] === 'message' && Array.isArray(item['content']))
    .flatMap((item) => (item as { content: unknown[] }).content);
  if (content.some((part) => isRecord(part) && part['type'] === 'refusal')) {
    return { kind: 'refused' };
  }
  const texts = content.filter((part) => isRecord(part) && part['type'] === 'output_text' && typeof part['text'] === 'string');
  if (texts.length !== 1) {
    return { kind: 'invalid-output', errors: [] };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse((texts[0] as { text: string }).text);
  } catch {
    return { kind: 'invalid-output', errors: [] };
  }
  const parsed = parseInBodyExtraction(decoded);
  return parsed.ok ? { kind: 'extraction', extraction: parsed.value } : { kind: 'invalid-output', errors: parsed.errors };
}
