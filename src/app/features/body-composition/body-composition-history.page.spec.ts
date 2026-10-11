import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { BodyCompositionHistoryRepository } from '../../core/body-composition/body-composition-history.repository';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { BodyCompositionAssessment, BodyCompositionSource, BodyCompositionValues, MANUAL_INBODY_SOURCE } from '../../domain/body-composition';
import { YouPage } from '../you/you.page';
import { BodyCompositionHistoryPage } from './body-composition-history.page';

const KEY = 'fitness.body-composition-assessments';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const MEASUREMENT_KEY = 'fitness.body-measurement-entries';
const PROFILE_KEY = 'fitness.profile';
/** Friday 9 October 2026, 08:00 local. */
const NOW = new Date(2026, 9, 9, 8, 0);
const WEIGHTS = JSON.stringify({ version: 1, entries: [{ id: 'w', date: '2026-10-08', weight: { kilograms: 79.9 } }] });
const MEASUREMENTS = JSON.stringify({ version: 1, entries: [{ id: 'm', date: '2026-10-08', values: { waist: { centimeters: 80 } } }] });
const PROFILE = JSON.stringify({ version: 2, profile: { weight: { kilograms: 82 }, unitSystem: 'metric' } });
const IMPORT_SOURCE: BodyCompositionSource = {
  device: 'inbody',
  entryMethod: 'import',
  format: 'inbody-570-result-sheet',
  parser: { name: 'inbody-pdf', version: '0.1.0' },
};
const assessment = (
  id: string,
  date: string,
  reported: BodyCompositionValues,
  source: BodyCompositionSource = MANUAL_INBODY_SOURCE,
  createdAt = `${date}T06:00:00.000Z`,
): BodyCompositionAssessment => ({ id, date, source, reported, createdAt, updatedAt: createdAt });
/** Stored by a newer app version: a metric this version doesn't know. */
const UNKNOWN_METRIC = {
  ...assessment('future', '2026-10-05', { weight: { value: 80, unit: 'kg' } }),
  reported: { weight: { value: 80, unit: 'kg' }, 'visceral-fat-level': { value: 7, unit: 'level' } },
};
const envelope = (assessments: readonly unknown[]) => JSON.stringify({ version: 1, assessments });

function configure(raw: string | null) {
  const storage = new MemoryKeyValueStorage();
  if (raw !== null) {
    storage.values.set(KEY, raw);
  }
  storage.values.set(WEIGHT_KEY, WEIGHTS);
  storage.values.set(MEASUREMENT_KEY, MEASUREMENTS);
  storage.values.set(PROFILE_KEY, PROFILE);
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return { storage, forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true) };
}

/** Service work isn't tracked by whenStable: let storage promises settle, then render. */
async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (root: Element, id: string) => root.querySelector(`[data-testid="${id}"]`);
const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-testid=assessment-row]')];
const latest = (el: HTMLElement) => [...el.querySelectorAll('[data-testid=latest-metric]')].map((r) => clean(r));

async function renderHistory(raw: string | null, before?: () => void) {
  const spies = configure(raw);
  before?.();
  const fixture = TestBed.createComponent(BodyCompositionHistoryPage);
  await settle(fixture);
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Body composition history page', () => {
  afterEach(() => vi.restoreAllMocks());

  const OLDER = assessment('older', '2026-10-01', { weight: { value: 176.83, unit: 'lb' }, 'body-fat-percentage': { value: 22.4, unit: '%' } });
  const AM = assessment('am', '2026-10-08', { 'lean-body-mass': { value: 62, unit: 'kg' } }, MANUAL_INBODY_SOURCE, '2026-10-08T05:00:00.000Z');
  const PM = assessment(
    'pm',
    '2026-10-08',
    { weight: { value: 81.37, unit: 'kg' }, 'body-fat-mass': { value: 18.25, unit: 'kg' } },
    IMPORT_SOURCE,
    '2026-10-08T18:00:00.000Z',
  );

  it('lists assessments newest first with their date, source and values exactly as recorded', async () => {
    const { el } = await renderHistory(envelope([AM, OLDER, PM]));
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Body composition');
    expect(clean(el.querySelector('.subtitle'))).toBe(
      'Values from your InBody reports, as recorded. Separate from your weight history, measurements and profile.',
    );
    expect(rows(el).map((r) => clean(r))).toEqual([
      'Yesterday Read from report Weight 81.37 kg Body fat mass 18.25 kg',
      // Lean body mass isn't a key value: shown on the assessment's own page.
      'Yesterday Entered by hand +1 more',
      'Thursday, Oct 1 Entered by hand Weight 176.83 lb Body fat percentage 22.4%',
    ]);
    expect(rows(el)[0].querySelectorAll('.row-value')).toHaveLength(2);
    // No conversion or interpretation.
    expect(el.textContent).not.toMatch(/80\.2|lost|gained|progress|trend|healthy|range|good|bad/i);
  });

  it('shows each metric’s latest reported value and date, or that it wasn’t recorded yet', async () => {
    const { el } = await renderHistory(envelope([AM, OLDER, PM]));
    expect(clean(el.querySelector('#body-composition-latest'))).toBe('Latest');
    expect(byTestId(el, 'latest')?.tagName).toBe('DL');
    // Weight: kg now, lb before — not converted, so not compared.
    expect(latest(el)).toEqual([
      'Weight 81.37 kg Yesterday Not compared with Oct 1 (different units)',
      'Body fat mass 18.25 kg Yesterday',
      'Lean body mass 62 kg Yesterday',
      'Body fat percentage 22.4% Thursday, Oct 1',
      'Skeletal muscle mass Not recorded yet',
      'Fat-free mass Not recorded yet',
    ]);
  });

  it('shows the difference since a metric’s previous report in the same unit, only when one exists', async () => {
    const raw = envelope([
      assessment('last-year', '2025-12-30', { 'body-fat-percentage': { value: 24, unit: '%' } }),
      assessment('sep', '2026-09-12', { weight: { value: 82.1, unit: 'kg' }, 'lean-body-mass': { value: 62, unit: 'kg' } }),
      assessment('oct', '2026-10-01', {
        'body-fat-percentage': { value: 22.8, unit: '%' },
        'lean-body-mass': { value: 62, unit: 'kg' },
        'body-fat-mass': { value: 18, unit: 'kg' },
      }),
      assessment('now', '2026-10-08', { weight: { value: 81.37, unit: 'kg' }, 'body-fat-mass': { value: 18.35, unit: 'kg' } }, IMPORT_SOURCE),
    ]);
    const { el, storage } = await renderHistory(raw);
    expect(latest(el)).toEqual([
      'Weight 81.37 kg Yesterday −0.73 kg since Sep 12',
      'Body fat mass 18.35 kg Yesterday +0.35 kg since Oct 1',
      'Lean body mass 62 kg Thursday, Oct 1 No change since Sep 12',
      'Body fat percentage 22.8% Thursday, Oct 1 −1.2 percentage points since Dec 30, 2025',
      'Skeletal muscle mass Not recorded yet',
      'Fat-free mass Not recorded yet',
    ]);
    expect([...el.querySelectorAll('[data-testid=latest-change]')].map((d) => d.tagName)).toEqual(['DD', 'DD', 'DD', 'DD']);
    expect(el.textContent).not.toMatch(/lost|gained|progress|trend|better|worse|good|bad|healthy|range/i);
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('shows metrics no assessment reported as not recorded yet', async () => {
    const { el } = await renderHistory(envelope([AM]));
    expect(latest(el)).toEqual([
      'Weight Not recorded yet',
      'Body fat mass Not recorded yet',
      'Lean body mass 62 kg Yesterday',
      'Body fat percentage Not recorded yet',
      'Skeletal muscle mass Not recorded yet',
      'Fat-free mass Not recorded yet',
    ]);
    // One assessment sets no trend.
    expect(clean(byTestId(el, 'single-note'))).toBe('Changes appear here once you add a second assessment.');
  });

  it('opens an assessment from its row', async () => {
    const { el, forward } = await renderHistory(envelope([PM, OLDER]));
    (rows(el)[1].querySelector('button') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/you', 'body-composition', 'older']);
    expect(byTestId(el, 'single-note')).toBeNull();
  });

  it('only reads: no edit or delete, and imported provenance is kept exactly', async () => {
    const raw = envelope([PM, OLDER]);
    const { el, storage } = await renderHistory(raw);
    expect(el.textContent).not.toMatch(/edit|delete|remove|discard|reset|recover/i);
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('opens Add assessment', async () => {
    const { el, forward } = await renderHistory(envelope([OLDER]));
    const add = byTestId(el, 'add-assessment') as HTMLButtonElement;
    expect(clean(add)).toBe('Add assessment');
    add.click();
    expect(forward).toHaveBeenCalledExactlyOnceWith(['/you', 'body-composition', 'new']);
  });

  it('an empty history invites the first assessment', async () => {
    const { el, forward } = await renderHistory(null);
    const empty = byTestId(el, 'assessment-empty')!;
    expect(clean(empty)).toContain('No assessments yet');
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Add assessment')!.click();
    expect(forward).toHaveBeenCalledWith(['/you', 'body-composition', 'new']);
    expect(rows(el)).toHaveLength(0);
    expect(byTestId(el, 'unsupported-notice')).toBeNull();
  });

  it('loading state', async () => {
    configure(null);
    vi.spyOn(TestBed.inject(BodyCompositionHistoryRepository), 'list').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(BodyCompositionHistoryPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(el, 'announcement'))).toBe('Loading your body composition');
    expect(byTestId(el, 'add-assessment')).toBeNull();
  });

  it('corrupt or newer-version storage is an error with Retry, and is never overwritten', async () => {
    for (const raw of ['{not json', JSON.stringify({ version: 2, assessments: [] }), JSON.stringify([1, 2])]) {
      TestBed.resetTestingModule();
      const { el, storage, fixture } = await renderHistory(raw);
      const card = byTestId(el, 'assessment-error')!;
      expect(clean(card)).toContain("Your body composition can't be read right now");
      expect(clean(card)).toContain('Nothing has been changed or deleted.');
      expect(clean(byTestId(el, 'announcement'))).toBe("Your body composition can't be read right now");
      expect([...card.querySelectorAll('button')].map((b) => clean(b))).toEqual(['Try again']);
      expect(byTestId(el, 'add-assessment')).toBeNull();
      card.querySelector('button')!.click();
      await settle(fixture);
      expect(byTestId(el, 'assessment-error')).not.toBeNull();
      expect(storage.values.get(KEY)).toBe(raw);
    }
  });

  it('retrying after a read failure recovers', async () => {
    const { el, fixture } = await renderHistory(envelope([OLDER]), () => {
      vi.spyOn(TestBed.inject(BodyCompositionHistoryRepository), 'list').mockRejectedValueOnce(new Error('boom'));
    });
    [...byTestId(el, 'assessment-error')!.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(rows(el)).toHaveLength(1);
  });

  it('says how many saved assessments can’t be shown, shows the rest, and keeps storage exactly', async () => {
    const raw = envelope([UNKNOWN_METRIC, OLDER, { id: 'broken' }]);
    const { el, storage } = await renderHistory(raw);
    expect(clean(byTestId(el, 'unsupported-notice'))).toBe(
      '2 saved assessments can’t be shown because they contain details this version of the app doesn’t support. They have been kept exactly as they are.',
    );
    expect(rows(el)).toHaveLength(1);
    // The unreadable assessment's weight isn't counted as the latest weight.
    expect(latest(el)[0]).toBe('Weight 176.83 lb Thursday, Oct 1');
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('with only unsupported assessments, the empty state also explains they were kept', async () => {
    const raw = envelope([UNKNOWN_METRIC]);
    const { el, storage } = await renderHistory(raw);
    expect(clean(byTestId(el, 'unsupported-notice'))).toBe(
      '1 saved assessment can’t be shown because it contains details this version of the app doesn’t support. It has been kept exactly as it is.',
    );
    expect(byTestId(el, 'assessment-empty')).not.toBeNull();
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('re-entering reloads (e.g. after adding an assessment)', async () => {
    const { el, fixture, storage } = await renderHistory(envelope([OLDER]));
    const page = fixture.componentInstance;
    page.ionViewWillEnter();
    storage.values.set(KEY, envelope([OLDER, AM, UNKNOWN_METRIC]));
    page.ionViewWillEnter();
    await settle(fixture);
    expect(rows(el)).toHaveLength(2);
    expect(byTestId(el, 'unsupported-notice')).not.toBeNull();
  });

  it('is separate from weight history, measurements and the profile: shows none, changes none', async () => {
    const { el, storage } = await renderHistory(envelope([OLDER]));
    expect(el.textContent).not.toMatch(/79\.9|Waist|82 kg/);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    expect(storage.values.get(MEASUREMENT_KEY)).toBe(MEASUREMENTS);
    expect(storage.values.get(PROFILE_KEY)).toBe(PROFILE);
  });

  it('is reached from You', async () => {
    const { forward } = configure(null);
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=body-composition-entry]')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.querySelector('.entry-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(clean(button)).toBe('Body composition Your recorded InBody assessments');
    button.click();
    expect(forward).toHaveBeenCalledWith('/you/body-composition');
  });
});
