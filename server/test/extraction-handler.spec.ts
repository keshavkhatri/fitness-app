import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INBODY_EXTRACTION_SCHEMA_NAME,
  inBodyExtractionJsonSchema,
  inBodyExtractionRequest,
} from '../../src/app/domain/inbody-extraction';
import { SAMPLE_INBODY380_EXTRACTION } from '../../src/app/domain/inbody-extraction/testing/sample-inbody380-extraction';
import { ProviderResult } from '../src/openai-client';
import {
  API_KEY,
  APP_ORIGIN,
  CONTEXT,
  JPEG_BYTES,
  WEBP_BYTES,
  base64,
  completed,
  harness,
  outputText,
  pngBytes,
  upload,
} from './fixtures';

const SUCCESS: ProviderResult = { ok: true, body: completed(outputText(JSON.stringify(SAMPLE_INBODY380_EXTRACTION))) };

const notOnReport = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };
const emptyExtraction = (outcome: string) => ({
  ...SAMPLE_INBODY380_EXTRACTION,
  outcome,
  metadata: Object.fromEntries(Object.keys(SAMPLE_INBODY380_EXTRACTION.metadata).map((k) => [k, notOnReport])),
  profile: Object.fromEntries(Object.keys(SAMPLE_INBODY380_EXTRACTION.profile).map((k) => [k, notOnReport])),
  measurements: Object.fromEntries(Object.keys(SAMPLE_INBODY380_EXTRACTION.measurements).map((k) => [k, notOnReport])),
});

async function errorOf(response: Response) {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return { status: response.status, code: body.error.code, message: body.error.message };
}

describe('POST /v1/inbody-extractions', () => {
  it('returns the validated extraction for a report image', async () => {
    const { handle } = harness(SUCCESS);
    const response = await handle(upload(pngBytes()), CONTEXT);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(await response.json()).toEqual(SAMPLE_INBODY380_EXTRACTION);
  });

  it('sends the image with the shared request builder, strict schema and store: false', async () => {
    const { handle, client } = harness(SUCCESS);
    const bytes = pngBytes(300);
    await handle(upload(bytes, { 'content-type': 'image/png; charset=binary' }), CONTEXT);

    expect(client.requests).toHaveLength(1);
    const expected = inBodyExtractionRequest(
      { mediaType: 'image/png', base64: base64(bytes) },
      { model: 'test-vision-model', maxOutputTokens: 8000 },
    );
    expect(expected.ok && client.requests[0]).toEqual(expected.ok && expected.body);
    expect(client.requests[0]).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', name: INBODY_EXTRACTION_SCHEMA_NAME, strict: true, schema: inBodyExtractionJsonSchema() } },
    });
    expect(JSON.stringify(client.requests[0])).not.toContain(API_KEY);
  });

  it.each([
    ['JPEG', 'image/jpeg', JPEG_BYTES],
    ['WEBP', 'image/webp', WEBP_BYTES],
  ])('accepts a %s report', async (_, contentType, bytes) => {
    const { handle, client } = harness(SUCCESS);
    expect((await handle(upload(bytes, { 'content-type': contentType }), CONTEXT)).status).toBe(200);
    expect(JSON.stringify(client.requests[0])).toContain(`data:${contentType};base64,${base64(bytes)}`);
  });

  it.each([
    ['a PDF', { 'content-type': 'application/pdf' }],
    ['a GIF', { 'content-type': 'image/gif' }],
    ['multipart form data', { 'content-type': 'multipart/form-data; boundary=x' }],
    ['no content type', { 'content-type': '' }],
  ])('rejects %s as unsupported without calling the provider', async (_, headers) => {
    const { handle, client } = harness(SUCCESS);
    const response = await handle(upload(pngBytes(), headers), CONTEXT);
    expect(await errorOf(response)).toMatchObject({ status: 415, code: 'unsupported-media-type', message: expect.stringMatching(/PNG, JPEG or WEBP/) });
    expect(client.requests).toHaveLength(0);
  });

  it.each([
    ['JPEG bytes declared as PNG', 'image/png', JPEG_BYTES],
    ['PNG bytes declared as WEBP', 'image/webp', pngBytes()],
    ['text declared as JPEG', 'image/jpeg', new TextEncoder().encode('hello, not an image')],
    ['a truncated signature', 'image/png', pngBytes().slice(0, 4)],
  ])('rejects %s', async (_, contentType, bytes) => {
    const { handle, client } = harness(SUCCESS);
    expect(await errorOf(await handle(upload(bytes, { 'content-type': contentType }), CONTEXT))).toMatchObject({ status: 400, code: 'invalid-image' });
    expect(client.requests).toHaveLength(0);
  });

  it('rejects an empty upload', async () => {
    const { handle, client } = harness(SUCCESS);
    expect(await errorOf(await handle(upload(null), CONTEXT))).toMatchObject({ status: 400, code: 'empty-upload' });
    expect(await errorOf(await handle(upload(new Uint8Array(0)), CONTEXT))).toMatchObject({ status: 400, code: 'empty-upload' });
    expect(client.requests).toHaveLength(0);
  });

  it('rejects an upload over the size limit while streaming it', async () => {
    const { handle, client } = harness(SUCCESS, { config: { maxUploadBytes: 2 * 1024 * 1024 } });
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(pngBytes(64 * 1024));
      },
    });
    const response = await handle(upload(endless, {}), CONTEXT);
    expect(await errorOf(response)).toEqual({ status: 413, code: 'upload-too-large', message: expect.stringMatching(/larger than 2 MB/) });
    expect(pulled).toBeLessThan(40); // stopped just past the limit
    expect(client.requests).toHaveLength(0);
  });

  it('rejects an upload whose declared length is over the limit without reading it', async () => {
    const { handle } = harness(SUCCESS, { config: { maxUploadBytes: 1024 } });
    const unread = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('the body must not be read');
      },
    });
    const response = await handle(upload(unread, { 'content-length': '5000' }), CONTEXT);
    expect(await errorOf(response)).toMatchObject({ status: 413, code: 'upload-too-large' });
  });

  it('accepts an upload exactly at the limit', async () => {
    const { handle } = harness(SUCCESS, { config: { maxUploadBytes: 1024 } });
    expect((await handle(upload(pngBytes(1024)), CONTEXT)).status).toBe(200);
    expect((await handle(upload(pngBytes(1025)), CONTEXT)).status).toBe(413);
  });

  it.each(['unsupported-report', 'insufficient-readable-information'])('returns the %s outcome as a validated extraction', async (outcome) => {
    const { handle } = harness({ ok: true, body: completed(outputText(JSON.stringify(emptyExtraction(outcome)))) });
    const response = await handle(upload(pngBytes()), CONTEXT);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ schemaVersion: 'inbody-extraction.v1', outcome });
  });

  it.each<[string, ProviderResult, number, string]>([
    ['a refusal', { ok: true, body: completed({ type: 'refusal', refusal: 'I cannot read the report of John Smith.' }) }, 422, 'extraction-refused'],
    [
      'an incomplete response',
      { ok: true, body: { ...completed(outputText('{"schemaVersion":')), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } },
      502,
      'extraction-incomplete',
    ],
    ['a failed response', { ok: true, body: { ...completed(), status: 'failed', error: { code: 'server_error', message: 'boom' } } }, 502, 'provider-error'],
    ['a non-JSON provider body', { ok: true, body: null }, 502, 'provider-error'],
    ['a timeout', { ok: false, failure: 'timeout' }, 504, 'provider-timeout'],
    ['a network failure', { ok: false, failure: 'network' }, 502, 'provider-error'],
    ['provider rate limiting', { ok: false, failure: 'rate-limited', status: 429 }, 503, 'provider-unavailable'],
    ['a provider outage', { ok: false, failure: 'http-error', status: 503 }, 503, 'provider-unavailable'],
    ['a rejected provider request', { ok: false, failure: 'http-error', status: 400 }, 502, 'provider-error'],
    ['output that is not JSON', { ok: true, body: completed(outputText('Weight 94.5 kg, John Smith')) }, 502, 'invalid-extraction'],
    [
      'output that breaks the contract',
      { ok: true, body: completed(outputText(JSON.stringify({ ...SAMPLE_INBODY380_EXTRACTION, extra: 'John Smith 94.5' }))) },
      502,
      'invalid-extraction',
    ],
    [
      'output with an invalid value',
      {
        ok: true,
        body: completed(
          outputText(
            JSON.stringify({
              ...SAMPLE_INBODY380_EXTRACTION,
              measurements: { ...SAMPLE_INBODY380_EXTRACTION.measurements, weight: { status: 'read', text: '94.5', unit: 'stone', sourceLabel: 'Weight' } },
            }),
          ),
        ),
      },
      502,
      'invalid-extraction',
    ],
  ])('handles %s with a safe error', async (_, result, status, code) => {
    const { handle } = harness(result);
    expect(await errorOf(await handle(upload(pngBytes()), CONTEXT))).toMatchObject({ status, code });
  });

  it('keeps report content, extracted values, provider text, client addresses and the key out of errors and logs', async () => {
    const bytes = pngBytes(128);
    const secrets = ['John Smith', '94.5', 'boom', API_KEY, base64(bytes), CONTEXT.remoteAddress, 'test-vision-model'];
    const results: ProviderResult[] = [
      { ok: true, body: completed({ type: 'refusal', refusal: 'I cannot read the report of John Smith.' }) },
      { ok: true, body: completed(outputText('Weight 94.5 kg, John Smith')) },
      { ok: true, body: completed(outputText(JSON.stringify({ ...SAMPLE_INBODY380_EXTRACTION, extra: 'John Smith 94.5' }))) },
      { ok: true, body: { ...completed(), status: 'failed', error: { message: 'boom John Smith' } } },
      { ok: false, failure: 'network' },
      SUCCESS,
    ];
    for (const result of results) {
      const { handle, logs } = harness(result);
      const response = await handle(upload(bytes), CONTEXT);
      const leaked = [JSON.stringify(logs), ...(response.ok ? [] : [await response.text()])].join('\n');
      for (const secret of secrets) {
        expect(leaked).not.toContain(secret);
      }
    }
  });

  it('logs only event codes for a contract failure (paths, never values)', async () => {
    const { handle, logs } = harness({ ok: true, body: completed(outputText(JSON.stringify({ ...SAMPLE_INBODY380_EXTRACTION, extra: 1 }))) });
    await handle(upload(pngBytes()), CONTEXT);
    expect(logs).toContainEqual({ event: 'extraction.invalid-output', fields: { errorCount: 1, paths: '<unknown>' } });
  });

  it('never logs a model-written key from a contract failure (it could quote the report)', async () => {
    const quoted = 'Patient Jane Example 1990-01-01';
    const { handle, logs } = harness({ ok: true, body: completed(outputText(JSON.stringify({ ...SAMPLE_INBODY380_EXTRACTION, [quoted]: 1 }))) });
    const response = await handle(upload(pngBytes()), CONTEXT);
    expect(response.status).toBe(502);
    expect(JSON.stringify(logs)).not.toContain('Jane');
    expect(await response.text()).not.toContain('Jane');
  });

  it('answers not-configured without reading the upload when the server has no API key', async () => {
    const { handle } = harness(SUCCESS, { noClient: true, config: { openAi: null } });
    const unread = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('the body must not be read');
      },
    });
    expect(await errorOf(await handle(upload(unread), CONTEXT))).toMatchObject({ status: 503, code: 'not-configured' });
  });
});

describe('rate limiting', () => {
  it('limits attempts per client and window', async () => {
    const { handle, clock } = harness(SUCCESS, { config: { clientRateLimit: 2, clientRateWindowMs: 60_000 } });
    expect((await handle(upload(pngBytes()), CONTEXT)).status).toBe(200);
    // Invalid uploads count too: each attempt costs server work.
    expect((await handle(upload(pngBytes(), { 'content-type': 'image/gif' }), CONTEXT)).status).toBe(415);
    const limited = await handle(upload(pngBytes()), CONTEXT);
    expect(await errorOf(limited)).toMatchObject({ status: 429, code: 'rate-limited' });
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(limited.headers.get('access-control-expose-headers')).toBe('Retry-After');

    expect((await handle(upload(pngBytes()), { remoteAddress: '198.51.100.1' })).status).toBe(200);
    clock.now += 60_000;
    expect((await handle(upload(pngBytes()), CONTEXT)).status).toBe(200);
  });

  it('caps provider calls across all clients per day', async () => {
    const { handle, client, clock } = harness(SUCCESS, { config: { dailyExtractionLimit: 2 } });
    expect((await handle(upload(pngBytes()), { remoteAddress: 'a' })).status).toBe(200);
    expect((await handle(upload(pngBytes()), { remoteAddress: 'b' })).status).toBe(200);
    const capped = await handle(upload(pngBytes()), { remoteAddress: 'c' });
    expect(await errorOf(capped)).toMatchObject({ status: 429, code: 'service-limit-reached' });
    expect(capped.headers.get('retry-after')).toBe(String(24 * 60 * 60));
    expect(client.requests).toHaveLength(2);
    clock.now += 24 * 60 * 60_000;
    expect((await handle(upload(pngBytes()), { remoteAddress: 'c' })).status).toBe(200);
  });

  it('identifies clients by the trusted proxy header when configured', async () => {
    const { handle } = harness(SUCCESS, { config: { clientRateLimit: 1, clientIpHeader: 'x-forwarded-for' } });
    const from = (chain: string) => upload(pngBytes(), { 'x-forwarded-for': chain });
    expect((await handle(from('10.0.0.1, 192.0.2.1'), CONTEXT)).status).toBe(200);
    // A spoofed first entry doesn't make a new client: the proxy's own entry (last) counts.
    expect((await handle(from('10.9.9.9, 192.0.2.1'), CONTEXT)).status).toBe(429);
    expect((await handle(from('192.0.2.2'), CONTEXT)).status).toBe(200);
  });
});

describe('CORS and routing', () => {
  it('rejects requests from origins that are not configured', async () => {
    const { handle, client } = harness(SUCCESS);
    const response = await handle(upload(pngBytes(), { origin: 'https://evil.example' }), CONTEXT);
    expect(await errorOf(response)).toMatchObject({ status: 403, code: 'origin-not-allowed' });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(client.requests).toHaveLength(0);
  });

  it('answers the preflight for the app origin only', async () => {
    const { handle } = harness(SUCCESS);
    const preflight = (origin: string) =>
      handle(new Request('http://localhost/v1/inbody-extractions', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } }), CONTEXT);
    const allowed = await preflight(APP_ORIGIN);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(allowed.headers.get('access-control-allow-methods')).toBe('POST');
    expect(allowed.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(allowed.headers.get('vary')).toBe('Origin');

    const denied = await preflight('https://evil.example');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves requests without an Origin (non-browser clients) under the same limits', async () => {
    const { handle } = harness(SUCCESS);
    const response = await handle(upload(pngBytes(), { origin: '' }), CONTEXT);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers health checks, unknown paths and other methods', async () => {
    const { handle } = harness(SUCCESS);
    const health = await handle(new Request('http://localhost/health'), CONTEXT);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect((await handle(new Request('http://localhost/v1/other', { method: 'POST' }), CONTEXT)).status).toBe(404);
    const get = await handle(new Request('http://localhost/v1/inbody-extractions'), CONTEXT);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST, OPTIONS');
  });
});

describe('storage', () => {
  it('never touches the file system: uploads and extractions stay in memory', () => {
    const dir = join(__dirname, '../src');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/from ['"](node:)?(fs|fs\/promises|os)['"]|require\(['"](node:)?fs/);
      expect(source, file).not.toMatch(/tmpdir|writeFile|createWriteStream/);
    }
  });
});
