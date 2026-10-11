import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { BODY_COMPOSITION_ASSESSMENT_ID } from '../../core/body-composition/body-composition-history.service';
import { INBODY_EXTRACTION_ENDPOINT, INBODY_EXTRACTION_FETCH } from '../../core/inbody/inbody-extraction.client';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { INBODY_AI_PROVENANCE } from '../../domain/inbody-extraction';
import { SAMPLE_INBODY380_EXTRACTION } from '../../domain/inbody-extraction/testing/sample-inbody380-extraction';
import { BodyCompositionDetailPage } from './body-composition-detail.page';
import { BodyCompositionEntryPage } from './body-composition-entry.page';
import { BodyCompositionHistoryPage } from './body-composition-history.page';

/**
 * Happy path for a new assessment outside onboarding: upload a report image
 * (answered by a stubbed fetch: no network), review the filled-in form,
 * save, and find it in the history and on its own page.
 */

const KEY = 'fitness.body-composition-assessments';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const PROFILE_KEY = 'fitness.profile';
const NOW = new Date(2026, 9, 9, 8, 0);
const WEIGHTS = JSON.stringify({ version: 1, entries: [{ id: 'w', date: '2026-10-01', weight: { kilograms: 82 } }] });
const PROFILE = JSON.stringify({ version: 2, profile: { weight: { kilograms: 82 }, unitSystem: 'metric' } });
const EARLIER = {
  id: 'earlier',
  date: '2026-09-01',
  source: { device: 'inbody', entryMethod: 'manual' },
  reported: { weight: { value: 95.2, unit: 'kg' }, 'skeletal-muscle-mass': { value: 35.1, unit: 'kg' } },
  createdAt: '2026-09-01T06:00:00.000Z',
  updatedAt: '2026-09-01T06:00:00.000Z',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const reportImage = () => new File([new Uint8Array(32)], 'my-inbody.png', { type: 'image/png' });
const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (root: Element, id: string) => root.querySelector(`[data-testid="${id}"]`);

function configure(answer: () => Promise<Response>) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set(KEY, JSON.stringify({ version: 1, assessments: [EARLIER] }));
  storage.values.set(WEIGHT_KEY, WEIGHTS);
  storage.values.set(PROFILE_KEY, PROFILE);
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(answer);
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: BODY_COMPOSITION_ASSESSMENT_ID, useValue: () => 'new-1' },
      { provide: INBODY_EXTRACTION_ENDPOINT, useValue: 'https://api.example.test/x' },
      { provide: INBODY_EXTRACTION_FETCH, useValue: fetch },
    ],
  });
  const nav = TestBed.inject(NavController);
  vi.spyOn(nav, 'navigateBack').mockResolvedValue(true);
  return { storage, fetch, forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true) };
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

async function renderEntry(answer: () => Promise<Response>) {
  const spies = configure(answer);
  const fixture = TestBed.createComponent(BodyCompositionEntryPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const input = (field: string) => byTestId(el, `field-${field}`)!.querySelector('input')!;
  const upload = async () => {
    const fileInput = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(fileInput, 'files', { value: [reportImage()], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  const submit = async () => {
    byTestId(el, 'body-composition-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };
  return { ...spies, fixture, el, input, upload, submit };
}

const storedAssessments = (storage: MemoryKeyValueStorage) => JSON.parse(storage.values.get(KEY)!).assessments;

describe('Body composition: add an assessment from a report', () => {
  afterEach(() => vi.restoreAllMocks());

  it('upload → review → save → history → detail, without touching the profile or weight history', async () => {
    const { el, input, upload, submit, storage, fetch, fixture } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
    await upload();
    expect(fetch).toHaveBeenCalledOnce();

    // Review: filled in, nothing saved yet.
    expect(clean(byTestId(el, 'review-notice'))).toContain('21 values were filled in');
    expect(input('weight').value).toBe('94.5');
    expect(input('skeletal-muscle-mass').value).toBe('35.8');
    expect(input('fat-free-mass').value).toBe('62.9');
    expect(input('lean-body-mass').value).toBe('');
    expect(input('date').value).toBe('2026-10-01');
    expect(byTestId(el, 'more-values')?.hasAttribute('open')).toBe(true);
    expect(storedAssessments(storage)).toHaveLength(1);

    await submit();
    const saved = storedAssessments(storage);
    expect(saved).toHaveLength(2);
    const added = saved.find((a: { id: string }) => a.id === 'new-1');
    expect(added.source).toEqual(INBODY_AI_PROVENANCE);
    expect(added.reported['fat-free-mass']).toEqual({ value: 62.9, unit: 'kg' });
    expect(added.reported['ecw-ratio']).toEqual({ value: 0.372, unit: 'none' });
    expect(added.reported).not.toHaveProperty('lean-body-mass');
    expect(storage.values.get(PROFILE_KEY)).toBe(PROFILE);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    fixture.destroy();

    // History (same root service): the new assessment first.
    const history = TestBed.createComponent(BodyCompositionHistoryPage);
    await settle(history);
    const rows = [...(history.nativeElement as HTMLElement).querySelectorAll('[data-testid=assessment-row]')].map((r) => clean(r));
    expect(rows[0]).toBe(
      'Thursday, Oct 1 Read from report Weight 94.5 kg Body fat percentage 33.4% Body fat mass 31.6 kg Skeletal muscle mass 35.8 kg Fat-free mass 62.9 kg +16 more',
    );
    history.destroy();

    // Detail: every value, with the difference from the earlier assessment.
    const detail = TestBed.createComponent(BodyCompositionDetailPage);
    detail.componentRef.setInput('assessmentId', 'new-1');
    await settle(detail);
    const d = detail.nativeElement as HTMLElement;
    const values = [...d.querySelectorAll('[data-testid=detail-value]')].map((v) => clean(v));
    expect(values).toContain('Weight 94.5 kg Change: −0.7 kg');
    expect(values).toContain('Skeletal muscle mass 35.8 kg Change: +0.7 kg');
    expect(values).toContain('Fat-free mass 62.9 kg');
    expect(values).toContain('ECW ratio 0.372');
    expect(values.some((v) => v.startsWith('Lean body mass'))).toBe(false);
    expect(clean(byTestId(d, 'detail-comparison'))).toContain('not a trend');
    expect(byTestId(d, 'log-weight')).not.toBeNull();
  });

  it('a corrected reading is saved as the user’s own entry, not as read from the report', async () => {
    const { input, upload, submit, storage, fixture } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
    await upload();
    input('weight').value = '94.2';
    input('weight').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await submit();
    const added = storedAssessments(storage).find((a: { id: string }) => a.id === 'new-1');
    expect(added.source).toEqual({ device: 'inbody', entryMethod: 'manual' });
    expect(added.reported.weight).toEqual({ value: 94.2, unit: 'kg' });
  });

  it('a failed upload explains itself and keeps manual entry available', async () => {
    const { el, input, upload, submit, storage, fixture } = await renderEntry(async () => {
      throw new TypeError('offline');
    });
    await upload();
    expect(clean(byTestId(el, 'report-status'))).toContain("Couldn't reach the report service");
    expect(byTestId(el, 'retry-report')).not.toBeNull();
    input('weight').value = '90';
    input('weight').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await submit();
    expect(storedAssessments(storage)).toHaveLength(2);
  });
});
