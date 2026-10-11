import { TestBed } from '@angular/core/testing';

import { SAMPLE_INBODY380_EXTRACTION } from '../../domain/inbody-extraction/testing/sample-inbody380-extraction';
import {
  INBODY_EXTRACTION_ENDPOINT,
  INBODY_EXTRACTION_FETCH,
  InBodyExtractionClient,
  MAX_REPORT_BYTES,
  checkReportFile,
} from './inbody-extraction.client';

const ENDPOINT = 'https://api.example.test/v1/inbody-extractions';
const png = (size = 16) => new Blob([new Uint8Array(size)], { type: 'image/png' });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const serverError = (status: number, code: string) => json(status, { error: { code, message: 'Fixed text.' } });

function setup(answer: () => Promise<Response>, endpoint: string | null = ENDPOINT) {
  const fetch = vi.fn<typeof globalThis.fetch>(answer);
  TestBed.configureTestingModule({
    providers: [
      { provide: INBODY_EXTRACTION_ENDPOINT, useValue: endpoint },
      { provide: INBODY_EXTRACTION_FETCH, useValue: fetch },
    ],
  });
  return { client: TestBed.inject(InBodyExtractionClient), fetch };
}

describe('checkReportFile', () => {
  it('accepts PNG, JPEG and WEBP images within the size limit', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(checkReportFile({ type, size: 1000 })).toBeNull();
    }
    expect(checkReportFile({ type: 'image/png', size: MAX_REPORT_BYTES })).toBeNull();
  });

  it('rejects other types, empty files and files over the limit', () => {
    expect(checkReportFile({ type: 'application/pdf', size: 1000 })).toBe('unsupported-type');
    expect(checkReportFile({ type: 'image/heic', size: 1000 })).toBe('unsupported-type');
    expect(checkReportFile({ type: 'image/png', size: 0 })).toBe('empty');
    expect(checkReportFile({ type: 'image/png', size: MAX_REPORT_BYTES + 1 })).toBe('too-large');
  });
});

describe('InBodyExtractionClient', () => {
  it('posts the raw image to the endpoint and returns the validated extraction', async () => {
    const { client, fetch } = setup(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
    const image = png();

    const result = await client.extract(image);

    expect(result).toEqual({ ok: true, extraction: SAMPLE_INBODY380_EXTRACTION });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init).toMatchObject({ method: 'POST', body: image, credentials: 'omit', headers: { 'content-type': 'image/png' } });
  });

  it('rejects a 200 answer that is not a valid extraction', async () => {
    const { client } = setup(async () => json(200, { ...SAMPLE_INBODY380_EXTRACTION, outcome: 'maybe' }));
    expect(await client.extract(png())).toEqual({ ok: false, failure: 'invalid-response' });
  });

  it('rejects a 200 answer that is not JSON', async () => {
    const { client } = setup(async () => new Response('<html>', { status: 200 }));
    expect(await client.extract(png())).toEqual({ ok: false, failure: 'invalid-response' });
  });

  it('maps server error codes to failures the user can act on', async () => {
    const cases: [Response, string][] = [
      [serverError(413, 'upload-too-large'), 'rejected-file'],
      [serverError(415, 'unsupported-media-type'), 'rejected-file'],
      [serverError(429, 'rate-limited'), 'busy'],
      [serverError(429, 'service-limit-reached'), 'busy'],
      [serverError(503, 'not-configured'), 'unavailable'],
      [serverError(403, 'origin-not-allowed'), 'unavailable'],
      [serverError(422, 'extraction-refused'), 'refused'],
      [serverError(502, 'invalid-extraction'), 'invalid-response'],
      [serverError(504, 'provider-timeout'), 'service'],
      [serverError(503, 'provider-unavailable'), 'service'],
      [new Response('Bad gateway', { status: 502 }), 'service'],
    ];
    for (const [response, failure] of cases) {
      TestBed.resetTestingModule();
      const { client } = setup(async () => response);
      expect(await client.extract(png())).toEqual({ ok: false, failure });
    }
  });

  it('reports a network failure when the request does not complete', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await client.extract(png())).toEqual({ ok: false, failure: 'network' });
  });

  it('never sends a file it can tell is unusable', async () => {
    const { client, fetch } = setup(async () => json(200, SAMPLE_INBODY380_EXTRACTION));

    expect(await client.extract(new Blob(['%PDF'], { type: 'application/pdf' }))).toEqual({ ok: false, failure: 'unsupported-type' });
    expect(await client.extract(png(MAX_REPORT_BYTES + 1))).toEqual({ ok: false, failure: 'too-large' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is unavailable, and sends nothing, without an endpoint', async () => {
    const { client, fetch } = setup(async () => json(200, SAMPLE_INBODY380_EXTRACTION), null);

    expect(client.available).toBe(false);
    expect(await client.extract(png())).toEqual({ ok: false, failure: 'unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
