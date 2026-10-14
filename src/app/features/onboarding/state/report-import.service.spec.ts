import { TestBed } from '@angular/core/testing';

import { INBODY_EXTRACTION_ENDPOINT, INBODY_EXTRACTION_FETCH } from '../../../core/inbody/inbody-extraction.client';
import { CLOCK } from '../../../core/time/clock';
import { REPORT_TODAY, rawExtraction, rejectedExtraction } from '../testing/report-fixtures';
import { ReportImport } from './report-import.service';

const reportImage = () => new File([new Uint8Array(32)], 'inbody.png', { type: 'image/png' });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function setup(...answers: (() => Promise<Response>)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const answer of answers) {
    fetch.mockImplementationOnce(answer);
  }
  TestBed.configureTestingModule({
    providers: [
      ReportImport,
      { provide: INBODY_EXTRACTION_ENDPOINT, useValue: 'https://api.example.test/v1/inbody-extractions' },
      { provide: INBODY_EXTRACTION_FETCH, useValue: fetch },
      { provide: CLOCK, useValue: () => new Date(`${REPORT_TODAY}T12:00:00`) },
    ],
  });
  return { report: TestBed.inject(ReportImport), fetch };
}

/** A fetch answer that waits until `resolve` is called. */
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { answer: () => promise, resolve };
}

describe('ReportImport', () => {
  it('reads a chosen report into suggestions for review, and lets the image go', async () => {
    const { report, fetch } = setup(async () => json(200, rawExtraction()));
    report.choose(reportImage());
    expect(report.current().status).toBe('selected');

    await report.read();

    expect(fetch).toHaveBeenCalledOnce();
    const state = report.current();
    expect(state.status).toBe('read');
    expect('file' in state).toBe(false);
    expect(report.reading()?.prefill.profile.height).toMatchObject({ kind: 'prefilled', value: { centimeters: 172 } });
    expect(['sex', 'height', 'weight'].map((f) => report.isPrefillPending(f as 'sex'))).toEqual([true, true, true]);

    // Each value is confirmed on its own screen; the others stay pending.
    report.markConfirmed('height');
    expect(['sex', 'height', 'weight'].map((f) => report.isPrefillPending(f as 'sex'))).toEqual([true, false, true]);
  });

  it('rejects an unusable file without sending it', async () => {
    const { report, fetch } = setup();
    report.choose(new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }));

    expect(report.current()).toEqual({ status: 'failed', failure: 'unsupported-type', reportIssues: [], file: null });
    await report.read();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns a rejected report into a failure that needs another image', async () => {
    const { report } = setup(async () => json(200, rejectedExtraction('unsupported-report')));
    report.choose(reportImage());
    await report.read();
    expect(report.current()).toEqual({ status: 'failed', failure: 'unsupported-report', reportIssues: [], file: null });
  });

  it('passes on why a report could not be read', async () => {
    const { report } = setup(async () => json(200, rejectedExtraction('insufficient-readable-information', ['partially-cropped'])));
    report.choose(reportImage());
    await report.read();
    expect(report.current()).toMatchObject({ failure: 'insufficient-readable-information', reportIssues: ['partially-cropped'] });
    expect(report.reading()).toBeNull();
  });

  it('rejects an invalid response instead of prefilling from it', async () => {
    const { report } = setup(async () => json(200, { ...(rawExtraction() as object), schemaVersion: 'inbody-extraction.v2' }));
    report.choose(reportImage());
    await report.read();
    expect(report.current()).toMatchObject({ status: 'failed', failure: 'invalid-response' });
    expect(report.reading()).toBeNull();
  });

  it('keeps the image after a network failure so the same image can be retried', async () => {
    const image = reportImage();
    const { report, fetch } = setup(
      () => Promise.reject(new TypeError('Failed to fetch')),
      async () => json(200, rawExtraction()),
    );
    report.choose(image);

    await report.read();
    expect(report.current()).toEqual({ status: 'failed', failure: 'network', reportIssues: [], file: image });

    await report.read();
    expect(report.current().status).toBe('read');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sends one request however often reading is asked for meanwhile', async () => {
    const pending = deferred();
    const { report, fetch } = setup(pending.answer);
    report.choose(reportImage());

    const first = report.read();
    void report.read();
    report.choose(reportImage());
    expect(report.current().status).toBe('reading');

    pending.resolve(json(200, rawExtraction()));
    await first;
    expect(fetch).toHaveBeenCalledOnce();
    expect(report.current().status).toBe('read');
  });

  it('drops an answer that arrives after a reset (e.g. switching to manual entry)', async () => {
    const pending = deferred();
    const { report } = setup(pending.answer);
    report.choose(reportImage());
    const reading = report.read();

    report.reset();
    pending.resolve(json(200, rawExtraction()));
    await reading;

    expect(report.current()).toEqual({ status: 'empty' });
    expect(report.isPrefillPending('weight')).toBe(false);
  });
});
