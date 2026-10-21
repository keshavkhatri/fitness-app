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
  reported: { weight: { value: 69.1, unit: 'kg' }, 'skeletal-muscle-mass': { value: 25.5, unit: 'kg' } },
  createdAt: '2026-09-01T06:00:00.000Z',
  updatedAt: '2026-09-01T06:00:00.000Z',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const reportImage = () => new File([new Uint8Array(32)], 'my-inbody.png', { type: 'image/png' });
const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (root: Element, id: string) => root.querySelector(`[data-testid="${id}"]`);
/** The full-screen reading overlay lives on <body>, over the tab bar. */
const overlay = (id = 'analysis-overlay') => byTestId(document.body, id);

/** 'new-1', then a different id for each further assessment (the store refuses a repeated id). */
const sequentialIds = () => {
  let n = 0;
  return () => (n++ === 0 ? 'new-1' : `new-${n}`);
};

function configure(answer: () => Promise<Response>, newId: () => string = sequentialIds()) {
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
      { provide: BODY_COMPOSITION_ASSESSMENT_ID, useValue: newId },
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

async function renderEntry(answer: () => Promise<Response>, newId?: () => string) {
  const spies = configure(answer, newId);
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
    expect(input('weight').value).toBe('68.4');
    expect(input('skeletal-muscle-mass').value).toBe('26.2');
    expect(input('fat-free-mass').value).toBe('47.3');
    // Only what the report showed is on screen: no empty field for a value it did not have.
    expect(byTestId(el, 'field-lean-body-mass')).toBeNull();
    expect(input('date').value).toBe('2026-09-14');
    expect(byTestId(el, 'more-values')?.hasAttribute('open')).toBe(true);
    expect(storedAssessments(storage)).toHaveLength(1);

    await submit();
    const saved = storedAssessments(storage);
    // The earlier one, this one, and the three earlier tests from the report's history chart.
    expect(saved).toHaveLength(5);
    const added = saved.find((a: { id: string }) => a.id === 'new-1');
    expect(added.source).toEqual(INBODY_AI_PROVENANCE);
    expect(added.reported['fat-free-mass']).toEqual({ value: 47.3, unit: 'kg' });
    expect(added.reported['ecw-ratio']).toEqual({ value: 0.378, unit: 'none' });
    expect(added.reported).not.toHaveProperty('lean-body-mass');
    expect(storage.values.get(PROFILE_KEY)).toBe(PROFILE);
    // The weights also became weigh-ins on their own dates: the one already there, this test and the three earlier ones.
    const weighIns = JSON.parse(storage.values.get(WEIGHT_KEY)!).entries as { date: string; weight: { kilograms: number } }[];
    expect(weighIns.map((w) => [w.date, w.weight.kilograms])).toEqual([
      ['2026-10-01', 82],
      ['2026-09-14', 68.4],
      ['2026-03-14', 71.9],
      ['2026-05-09', 70.6],
      ['2026-07-18', 69.3],
    ]);
    fixture.destroy();

    // History (same root service): the new assessment first.
    const history = TestBed.createComponent(BodyCompositionHistoryPage);
    await settle(history);
    const rows = [...(history.nativeElement as HTMLElement).querySelectorAll('[data-testid=assessment-row]')].map((r) => clean(r));
    expect(rows[0]).toBe(
      'Monday, Sep 14 Read from report Weight 68.4 kg Body fat percentage 30.8% Body fat mass 21.1 kg Skeletal muscle mass 26.2 kg Fat-free mass 47.3 kg +16 more',
    );
    history.destroy();

    // Detail: every value, with the difference from the earlier assessment.
    const detail = TestBed.createComponent(BodyCompositionDetailPage);
    detail.componentRef.setInput('assessmentId', 'new-1');
    await settle(detail);
    const d = detail.nativeElement as HTMLElement;
    expect(d.classList).toContain('fit-theme-immersive');
    // Overview: the report's headline values and its composition, as printed.
    expect(clean(byTestId(d, 'tile-weight'))).toBe('Weight 68.4 kg Change: −0.7 kg');
    expect(clean(byTestId(d, 'tile-skeletal-muscle-mass'))).toBe('Skeletal muscle mass 26.2 kg Change: +0.7 kg');
    const composition = [...d.querySelectorAll('[data-testid^=composition-]')].map((r) => clean(r));
    expect(composition.length).toBeGreaterThan(0);
    // A mass in the weight's unit shows its calculated share; water (litres) never does.
    expect(composition.find((c) => c.startsWith('Body fat mass'))).toMatch(/% of weight$/);
    expect(composition.find((c) => c.startsWith('Total body water')) ?? '').not.toContain('% of weight');
    d.querySelector<HTMLInputElement>('input[name=detail-tab][value=all]')!.click();
    detail.detectChanges();
    const values = [...d.querySelectorAll('[data-testid=detail-value]')].map((v) => clean(v));
    expect(values).toContain('Weight 68.4 kg Change: −0.7 kg');
    expect(values).toContain('Skeletal muscle mass 26.2 kg Change: +0.7 kg');
    expect(values).toContain('Fat-free mass 47.3 kg');
    expect(values).toContain('ECW ratio 0.378');
    expect(values.some((v) => v.startsWith('Lean body mass'))).toBe(false);
    expect(clean(byTestId(d, 'detail-comparison'))).toContain('not a trend');
    expect(byTestId(d, 'log-weight')).not.toBeNull();
  });

  it('offers Take photo and Choose from files for the same image upload, with the formats it really accepts', async () => {
    const { el, fixture } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
    expect(el.classList).toContain('fit-theme-immersive');
    expect(clean(byTestId(el, 'take-photo'))).toBe('Take photo');
    expect(clean(byTestId(el, 'choose-report'))).toBe('Choose from files');
    const inputs = [...el.querySelectorAll<HTMLInputElement>('input[type=file]')];
    expect(inputs.map((i) => [i.accept, i.getAttribute('capture')])).toEqual([
      ['image/png,image/jpeg,image/webp', null],
      ['image/png,image/jpeg,image/webp', 'environment'],
    ]);
    expect(el.textContent).toContain('Supported formats: JPG, PNG or WebP image, up to 8 MB');
    expect(el.textContent).not.toMatch(/PDF/);
    const camera = vi.spyOn(inputs[1], 'click').mockImplementation(() => undefined);
    (byTestId(el, 'take-photo') as HTMLButtonElement).click();
    expect(camera).toHaveBeenCalledOnce();
    fixture.detectChanges();
  });

  it('a second Save after a successful one (a double click) saves nothing more', async () => {
    const { upload, submit, storage } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
    await upload();
    await submit();
    await submit();
    expect(storedAssessments(storage)).toHaveLength(5); // the earlier one, this one and the report's 3 earlier tests, once each
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

  describe('after a report has been read', () => {
    it('steps the picker aside for a compact result, with a way to add another image', async () => {
      const { el, fixture, upload } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      expect(byTestId(el, 'take-photo')).not.toBeNull();
      await upload();
      expect(clean(byTestId(el, 'report-read'))).toContain('Report read');
      expect(byTestId(el, 'take-photo')).toBeNull();
      expect(byTestId(el, 'choose-report')).toBeNull();
      expect(el.textContent).not.toContain('Supported formats');

      (byTestId(el, 'change-report') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(byTestId(el, 'take-photo')).not.toBeNull();
      expect(byTestId(el, 'choose-report')).not.toBeNull();
      expect(byTestId(el, 'report-read')).toBeNull();
    });

    it('shows only the values the report had, and the rest on request', async () => {
      const { el, fixture, upload } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      await upload();
      const shown = () => [...el.querySelectorAll('[data-testid^="field-"]')].map((f) => f.getAttribute('data-testid')!.replace('field-', ''));
      expect(shown()).toContain('weight');
      expect(shown()).toContain('skeletal-muscle-mass');
      expect(shown()).toContain('ecw-ratio');
      expect(shown()).not.toContain('lean-body-mass'); // the report has no such value
      expect(byTestId(el, 'show-all-fields')).not.toBeNull();

      (byTestId(el, 'show-all-fields') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(shown()).toContain('lean-body-mass');
      expect(byTestId(el, 'show-all-fields')).toBeNull();
    });

    it('keeps a captured value on screen while it is being retyped (even emptied)', async () => {
      const { el, fixture, upload, input } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      await upload();
      input('weight').value = '';
      input('weight').dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(byTestId(el, 'field-weight')).not.toBeNull();
    });
  });

  describe('weights from the report', () => {
    const weighIns = (storage: MemoryKeyValueStorage) =>
      (JSON.parse(storage.values.get(WEIGHT_KEY)!).entries as { date: string; weight: { kilograms: number } }[]).map((w) => [w.date, w.weight.kilograms]);

    it('are skipped when that day already has the same weight, so a report saved twice does not double them', async () => {
      const first = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      await first.upload();
      await first.submit();
      expect(weighIns(first.storage)).toHaveLength(5);
      const kept = first.storage.values.get(WEIGHT_KEY)!;
      first.fixture.destroy();

      // Same report again, in a fresh page over the same storage.
      TestBed.resetTestingModule();
      const second = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      second.storage.values.set(WEIGHT_KEY, kept);
      second.storage.values.set(KEY, first.storage.values.get(KEY)!);
      await second.upload();
      await second.submit();
      expect(weighIns(second.storage)).toHaveLength(5);
    });

    it('can be switched off: the assessments are saved, the weight history is left alone', async () => {
      const { el, fixture, upload, submit, storage } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      await upload();
      (byTestId(el, 'log-weight') as HTMLInputElement).click();
      fixture.detectChanges();
      await submit();
      expect(storedAssessments(storage)).toHaveLength(5);
      expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    });

    it('go in the unit the report printed, and only for the earlier tests the user kept', async () => {
      const { el, fixture, upload, submit, storage } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      await upload();
      byTestId(el, 'earlier-2026-05-09')!.querySelector<HTMLInputElement>('input')!.click();
      fixture.detectChanges();
      await submit();
      expect(weighIns(storage).map(([date]) => date)).not.toContain('2026-05-09');
      expect(weighIns(storage)).toContainEqual(['2026-03-14', 71.9]);
    });
  });

  describe('the values form', () => {
    it('is hidden until the user chooses manual entry', async () => {
      const { el, fixture, input } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      expect(byTestId(el, 'body-composition-form')).toBeNull();
      expect(byTestId(el, 'save')).toBeNull();
      expect(clean(byTestId(el, 'manual-entry'))).toBe('Enter values manually');
      expect(byTestId(el, 'report-upload')).not.toBeNull();

      (byTestId(el, 'manual-entry') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(byTestId(el, 'body-composition-form')).not.toBeNull();
      expect(byTestId(el, 'save')).not.toBeNull();
      expect(input('weight').value).toBe('');
      // The choice is made: the button is no longer needed.
      expect(byTestId(el, 'manual-entry')).toBeNull();
    });

    it('appears, filled in for review, once a report has been read', async () => {
      const { el, upload, input } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION));
      expect(byTestId(el, 'body-composition-form')).toBeNull();
      await upload();
      expect(byTestId(el, 'body-composition-form')).not.toBeNull();
      expect(input('weight').value).toBe('68.4');
      expect(byTestId(el, 'manual-entry')).toBeNull();
    });

    it('stays hidden while a report is being read or after a failed read', async () => {
      const { el, upload } = await renderEntry(async () => {
        throw new TypeError('offline');
      });
      await upload();
      expect(byTestId(el, 'body-composition-form')).toBeNull();
      expect(byTestId(el, 'manual-entry')).not.toBeNull();
    });
  });

  describe('earlier results from the report’s history chart', () => {
    const ids = sequentialIds;
    const rowsOf = (el: HTMLElement) => [...el.querySelectorAll('[data-testid^="earlier-2"]')];

    it('lists the earlier tests, oldest first, all switched on, leaving out the current test', async () => {
      const { el, upload } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION), ids());
      expect(byTestId(el, 'earlier-results')).toBeNull();
      await upload();
      expect(clean(byTestId(el, 'earlier-results'))).toContain('The report also lists 3 earlier tests');
      expect(rowsOf(el).map((r) => clean(r))).toEqual([
        'Mar 14 71.9 kg · 25.4 kg muscle · 33.6% body fat',
        'May 9 70.6 kg · 25.7 kg muscle · 32.4% body fat',
        'Jul 18 69.3 kg · 26 kg muscle · 31.5% body fat',
      ]);
      expect(rowsOf(el).every((r) => r.querySelector<HTMLInputElement>('input')!.checked)).toBe(true);
    });

    it('saves each chosen earlier test as its own assessment read from the report, after the main one', async () => {
      const { upload, submit, storage } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION), ids());
      await upload();
      await submit();
      const saved = storedAssessments(storage) as { id: string; date: string; source: unknown; reported: Record<string, unknown> }[];
      expect(saved.map((a) => a.date).sort()).toEqual(['2026-03-14', '2026-05-09', '2026-07-18', '2026-09-01', '2026-09-14']);
      const march = saved.find((a) => a.date === '2026-03-14')!;
      expect(march.source).toEqual(INBODY_AI_PROVENANCE);
      expect(march.reported).toEqual({
        weight: { value: 71.9, unit: 'kg' },
        'skeletal-muscle-mass': { value: 25.4, unit: 'kg' },
        'body-fat-percentage': { value: 33.6, unit: '%' },
      });
    });

    it('leaves out an earlier test the user switched off', async () => {
      const { el, fixture, upload, submit, storage } = await renderEntry(async () => json(200, SAMPLE_INBODY380_EXTRACTION), ids());
      await upload();
      const may = byTestId(el, 'earlier-2026-05-09')!.querySelector<HTMLInputElement>('input')!;
      may.click();
      fixture.detectChanges();
      expect(may.checked).toBe(false);
      await submit();
      expect((storedAssessments(storage) as { date: string }[]).map((a) => a.date)).not.toContain('2026-05-09');
      expect(storedAssessments(storage)).toHaveLength(4);
    });

    it('never adds a date that is already in the history again', async () => {
      const dated = { ...SAMPLE_INBODY380_EXTRACTION, history: [...SAMPLE_INBODY380_EXTRACTION.history.slice(0, 1), { ...SAMPLE_INBODY380_EXTRACTION.history[0], 'test-date-time': { ...SAMPLE_INBODY380_EXTRACTION.history[0]['test-date-time'], text: '2026.09.01' } }] };
      const { el, upload, submit, storage } = await renderEntry(async () => json(200, dated), ids());
      await upload();
      const existing = byTestId(el, 'earlier-2026-09-01')!;
      expect(clean(existing)).toContain('Already in your history');
      expect(existing.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
      await submit();
      expect((storedAssessments(storage) as { date: string }[]).filter((a) => a.date === '2026-09-01')).toHaveLength(1);
      expect(storedAssessments(storage)).toHaveLength(3); // the one already there, the main one, March
    });

    it('offers nothing when the report has no history chart (or an older server did not send one)', async () => {
      const { history: _history, ...older } = SAMPLE_INBODY380_EXTRACTION;
      const { el, upload } = await renderEntry(async () => json(200, older), ids());
      await upload();
      expect(byTestId(el, 'earlier-results')).toBeNull();
    });
  });

  it('shows a full-screen reading overlay while the report is read, with a way to cancel, and no AI notice', async () => {
    let answer!: (response: Response) => void;
    const { el, fixture, upload, input } = await renderEntry(() => new Promise<Response>((resolve) => (answer = resolve)));
    expect(el.textContent).not.toMatch(/AI service|OpenAI/);
    expect(overlay()).toBeNull();

    const fileInput = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(fileInput, 'files', { value: [reportImage()], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(overlay()).not.toBeNull();
    expect(overlay()?.getAttribute('aria-label')).toBe('Reading your report');
    expect(clean(overlay('analysis-message'))).not.toBe('');

    answer(json(200, SAMPLE_INBODY380_EXTRACTION));
    await settle(fixture);
    expect(overlay()).toBeNull();
    expect(input('weight').value).toBe('68.4');
    void upload;
  });

  it('cancelling the reading closes the overlay and drops a late answer', async () => {
    let answer!: (response: Response) => void;
    const { el, fixture, input } = await renderEntry(() => new Promise<Response>((resolve) => (answer = resolve)));
    const fileInput = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(fileInput, 'files', { value: [reportImage()], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await settle(fixture);
    (overlay('analysis-cancel') as HTMLButtonElement).click();
    await settle(fixture);
    expect(overlay()).toBeNull();
    answer(json(200, SAMPLE_INBODY380_EXTRACTION));
    await settle(fixture);
    // The late answer is dropped: nothing was filled in, and the form is still hidden.
    expect(byTestId(el, 'body-composition-form')).toBeNull();
    void input;
  });

  it('a failed upload explains itself and keeps manual entry available', async () => {
    const { el, input, upload, submit, storage, fixture } = await renderEntry(async () => {
      throw new TypeError('offline');
    });
    await upload();
    expect(clean(byTestId(el, 'report-status'))).toContain("Couldn't reach the report service");
    expect(byTestId(el, 'retry-report')).not.toBeNull();
    // Manual entry is one tap away.
    expect(byTestId(el, 'body-composition-form')).toBeNull();
    (byTestId(el, 'manual-entry') as HTMLButtonElement).click();
    fixture.detectChanges();
    input('weight').value = '90';
    input('weight').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await submit();
    expect(storedAssessments(storage)).toHaveLength(2);
  });
});
