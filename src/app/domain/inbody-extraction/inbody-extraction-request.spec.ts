import { INBODY_EXTRACTION_SCHEMA_NAME, inBodyExtractionJsonSchema } from './inbody-extraction-contract';
import { inBodyExtractionRequest, readInBodyExtractionResponse } from './inbody-extraction-request';
import { SAMPLE_INBODY380_EXTRACTION } from './testing/sample-inbody380-extraction';

const IMAGE = { mediaType: 'image/png', base64: 'iVBORw0KGgo=' };
const OPTIONS = { model: 'configured-model', maxOutputTokens: 4000 };

/** A raw Responses API body with one assistant message. */
const completed = (...content: unknown[]) => ({
  id: 'resp_1',
  status: 'completed',
  error: null,
  incomplete_details: null,
  output: [{ type: 'message', role: 'assistant', status: 'completed', content }],
});
const outputText = (text: string) => ({ type: 'output_text', text, annotations: [] });

describe('InBody extraction request', () => {
  it('builds a strict Structured Outputs request that the API does not store', () => {
    const result = inBodyExtractionRequest(IMAGE, OPTIONS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toMatchObject({
        model: 'configured-model',
        store: false,
        max_output_tokens: 4000,
        input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'high' }] }],
        text: { format: { type: 'json_schema', name: INBODY_EXTRACTION_SCHEMA_NAME, strict: true, schema: inBodyExtractionJsonSchema() } },
      });
      expect(result.body['instructions']).toMatch(/Never guess/);
    }
  });

  it.each([
    ['a PDF', { ...IMAGE, mediaType: 'application/pdf' }, OPTIONS, 'unsupported-media-type'],
    ['a GIF', { ...IMAGE, mediaType: 'image/gif' }, OPTIONS, 'unsupported-media-type'],
    ['a data URL instead of base64', { ...IMAGE, base64: 'data:image/png;base64,iVBORw0KGgo=' }, OPTIONS, 'invalid-image'],
    ['an empty image', { ...IMAGE, base64: '' }, OPTIONS, 'invalid-image'],
    ['no model', IMAGE, { ...OPTIONS, model: ' ' }, 'invalid-options'],
    ['no token budget', IMAGE, { ...OPTIONS, maxOutputTokens: 0 }, 'invalid-options'],
  ])('rejects %s', (_, image, options, problem) => {
    expect(inBodyExtractionRequest(image, options)).toEqual({ ok: false, problem });
  });
});

describe('InBody extraction response', () => {
  it('returns the validated extraction from a completed response', () => {
    expect(readInBodyExtractionResponse(completed(outputText(JSON.stringify(SAMPLE_INBODY380_EXTRACTION))))).toEqual({
      kind: 'extraction',
      extraction: SAMPLE_INBODY380_EXTRACTION,
    });
  });

  it('reports a refusal without keeping its text', () => {
    const result = readInBodyExtractionResponse(completed({ type: 'refusal', refusal: 'I cannot help with this report for John.' }));
    expect(result).toEqual({ kind: 'refused' });
  });

  it.each([
    ['max_output_tokens', 'max-output-tokens'],
    ['content_filter', 'content-filter'],
    ['steered', 'other'],
  ])('never reads output that stopped early (%s)', (reason, expected) => {
    const response = { ...completed(outputText('{"schemaVersion":')), status: 'incomplete', incomplete_details: { reason } };
    expect(readInBodyExtractionResponse(response)).toEqual({ kind: 'incomplete', reason: expected });
  });

  it.each([
    ['an API error', { ...completed(), status: 'failed', error: { code: 'server_error', message: 'x' } }],
    ['a queued response', { ...completed(), status: 'queued' }],
    ['no output array', { status: 'completed' }],
    ['not an object', 'oops'],
  ])('fails on %s', (_, response) => {
    expect(readInBodyExtractionResponse(response)).toEqual({ kind: 'failed' });
  });

  it('rejects output that is not exactly one JSON text matching the contract', () => {
    expect(readInBodyExtractionResponse(completed(outputText('The weight is 68.4 kg.')))).toEqual({ kind: 'invalid-output', errors: [] });
    expect(readInBodyExtractionResponse(completed())).toEqual({ kind: 'invalid-output', errors: [] });
    expect(readInBodyExtractionResponse(completed(outputText('{}'), outputText('{}')))).toEqual({ kind: 'invalid-output', errors: [] });
    const wrongVersion = { ...SAMPLE_INBODY380_EXTRACTION, schemaVersion: 'inbody-extraction.v0' };
    expect(readInBodyExtractionResponse(completed(outputText(JSON.stringify(wrongVersion))))).toEqual({
      kind: 'invalid-output',
      errors: [{ path: 'schemaVersion', problem: 'unsupported-version' }],
    });
  });
});
