import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { MeasurementHistoryRepository } from '../../core/body-measurements/measurement-history.repository';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { MeasurementEntry, MeasurementValues } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { YouPage } from '../you/you.page';
import { MeasurementHistoryPage } from './measurement-history.page';

const KEY = 'fitness.body-measurement-entries';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const PROFILE_KEY = 'fitness.profile';
/** Friday 9 October 2026, 08:00 local. */
const NOW = new Date(2026, 9, 9, 8, 0);
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 82 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const WEIGHTS = JSON.stringify({
  version: 1,
  entries: [{ id: 'w', date: '2026-10-08', weight: { kilograms: 81.5 }, createdAt: '2026-10-08T06:00:00.000Z', updatedAt: '2026-10-08T06:00:00.000Z' }],
});
const entry = (id: string, date: string, values: MeasurementValues, createdAt = `${date}T06:00:00.000Z`): MeasurementEntry => ({
  id,
  date,
  values,
  createdAt,
  updatedAt: createdAt,
});
/** Stored by a newer app version: a site this version doesn't know. */
const UNKNOWN_SITE = {
  id: 'future',
  date: '2026-10-05',
  values: { waist: { centimeters: 80 }, neck: { centimeters: 38 } },
  createdAt: '2026-10-05T06:00:00.000Z',
  updatedAt: '2026-10-05T06:00:00.000Z',
};
const envelope = (entries: readonly unknown[]) => JSON.stringify({ version: 1, entries });

function configure(raw: string | null, profile: UserFitnessProfile | null = PROFILE) {
  const storage = new MemoryKeyValueStorage();
  if (raw !== null) {
    storage.values.set(KEY, raw);
  }
  storage.values.set(WEIGHT_KEY, WEIGHTS);
  if (profile) {
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile }));
  }
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    profileBefore: storage.values.get(PROFILE_KEY),
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
  };
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
const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-testid=measurement-row]')];
const latest = (el: HTMLElement) => [...el.querySelectorAll('[data-testid=latest-site]')].map((r) => clean(r));

async function renderHistory(raw: string | null, profile?: UserFitnessProfile | null, before?: () => void) {
  const spies = configure(raw, profile);
  before?.();
  const fixture = TestBed.createComponent(MeasurementHistoryPage);
  await settle(fixture);
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Measurement history page', () => {
  afterEach(() => vi.restoreAllMocks());

  const OLDER = entry('older', '2026-10-01', { waist: { centimeters: 82 }, arm: { centimeters: 33.4 } });
  const AM = entry('am', '2026-10-08', { waist: { centimeters: 80.5 } }, '2026-10-08T05:00:00.000Z');
  const PM = entry('pm', '2026-10-08', { waist: { centimeters: 80.25 }, hips: { centimeters: 99 } }, '2026-10-08T18:00:00.000Z');

  it('lists entries newest first with their date and recorded measurements', async () => {
    const { el } = await renderHistory(envelope([AM, OLDER, PM]));
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Measurements');
    expect(clean(el.querySelector('.subtitle'))).toBe('A record of your tape measurements. Separate from your weight history and profile.');
    expect(rows(el).map((r) => clean(r))).toEqual([
      'Yesterday Waist 80.3 cm Hips 99.0 cm',
      'Yesterday Waist 80.5 cm',
      'Thursday, Oct 1 Waist 82.0 cm Arm 33.4 cm',
    ]);
    expect(rows(el)[0].getAttribute('aria-label')).toBe('Edit measurements from Yesterday: Waist 80.3 cm, Hips 99.0 cm');
    expect(el.textContent).not.toMatch(/lost|gained|progress|trend|%/i);
  });

  it('shows each site’s latest recorded value and date, or that it wasn’t measured yet', async () => {
    const { el } = await renderHistory(envelope([OLDER, AM, PM]));
    expect(clean(el.querySelector('#measurement-latest'))).toBe('Latest');
    expect(latest(el)).toEqual([
      'Waist 80.3 cm Yesterday',
      'Chest Not measured yet',
      'Hips 99.0 cm Yesterday',
      'Arm 33.4 cm Thursday, Oct 1',
      'Thigh Not measured yet',
    ]);
    expect(byTestId(el, 'latest')?.tagName).toBe('DL');
  });

  it('displays in the profile’s unit; stored centimeters are unchanged', async () => {
    const raw = envelope([entry('a', '2026-10-08', { waist: { centimeters: 81.28 }, thigh: { centimeters: 57.15 } })]);
    const { el, storage } = await renderHistory(raw, { ...PROFILE, unitSystem: 'imperial' });
    expect(rows(el).map((r) => clean(r))).toEqual(['Yesterday Waist 32.0 in Thigh 22.5 in']);
    expect(latest(el)[0]).toBe('Waist 32.0 in Yesterday');
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('opens add and edit', async () => {
    const { el, forward } = await renderHistory(envelope([OLDER]));
    (byTestId(el, 'add-measurement') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/you', 'measurements', 'new']);
    (rows(el)[0] as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/you', 'measurements', 'older']);
  });

  it('an empty history invites the first entry', async () => {
    const { el, forward } = await renderHistory(null);
    const empty = byTestId(el, 'measurement-empty')!;
    expect(clean(empty)).toContain('No measurements yet');
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Add measurements')!.click();
    expect(forward).toHaveBeenCalledWith(['/you', 'measurements', 'new']);
    expect(rows(el)).toHaveLength(0);
    expect(byTestId(el, 'unsupported-notice')).toBeNull();
  });

  it('loading state', async () => {
    configure(null);
    vi.spyOn(TestBed.inject(MeasurementHistoryRepository), 'list').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(MeasurementHistoryPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(el, 'announcement'))).toBe('Loading your measurements');
    expect(byTestId(el, 'add-measurement')).toBeNull();
  });

  it('corrupt or newer-version storage is an error with Retry, and is never overwritten', async () => {
    for (const raw of ['{not json', JSON.stringify({ version: 2, entries: [] }), JSON.stringify([1, 2])]) {
      TestBed.resetTestingModule();
      const { el, storage, fixture } = await renderHistory(raw);
      const card = byTestId(el, 'measurement-error')!;
      expect(clean(card)).toContain("Your measurements can't be read right now");
      expect(clean(card)).toContain('Nothing has been changed or deleted.');
      expect(clean(byTestId(el, 'announcement'))).toBe("Your measurements can't be read right now");
      expect([...card.querySelectorAll('button')].map((b) => clean(b))).toEqual(['Try again']);
      expect(byTestId(el, 'add-measurement')).toBeNull();
      card.querySelector('button')!.click();
      await settle(fixture);
      expect(byTestId(el, 'measurement-error')).not.toBeNull();
      expect(storage.values.get(KEY)).toBe(raw);
    }
  });

  it('retrying after a read failure recovers', async () => {
    const { el, fixture } = await renderHistory(envelope([OLDER]), PROFILE, () => {
      vi.spyOn(TestBed.inject(MeasurementHistoryRepository), 'list').mockRejectedValueOnce(new Error('boom'));
    });
    [...byTestId(el, 'measurement-error')!.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(rows(el)).toHaveLength(1);
  });

  it('says how many saved entries can’t be shown, shows the rest, and keeps storage exactly', async () => {
    const raw = envelope([UNKNOWN_SITE, OLDER, { id: 'broken' }]);
    const { el, storage } = await renderHistory(raw);
    expect(clean(byTestId(el, 'unsupported-notice'))).toBe(
      '2 saved entries can’t be shown because they contain measurements this version of the app doesn’t support. They have been kept exactly as they are.',
    );
    expect(rows(el).map((r) => clean(r))).toEqual(['Thursday, Oct 1 Waist 82.0 cm Arm 33.4 cm']);
    // The unreadable entry's waist isn't counted as the latest waist.
    expect(latest(el)[0]).toBe('Waist 82.0 cm Thursday, Oct 1');
    expect(el.textContent).not.toMatch(/delete|remove|discard|reset/i);
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('with only unsupported entries, the empty state also explains they were kept', async () => {
    const raw = envelope([UNKNOWN_SITE]);
    const { el, storage } = await renderHistory(raw);
    expect(clean(byTestId(el, 'unsupported-notice'))).toBe(
      '1 saved entry can’t be shown because it contains measurements this version of the app doesn’t support. It has been kept exactly as it is.',
    );
    expect(byTestId(el, 'measurement-empty')).not.toBeNull();
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('re-entering reloads (e.g. after saving an entry)', async () => {
    const { el, fixture, storage } = await renderHistory(envelope([OLDER]));
    const page = fixture.componentInstance;
    page.ionViewWillEnter();
    storage.values.set(KEY, envelope([OLDER, AM, UNKNOWN_SITE]));
    page.ionViewWillEnter();
    await settle(fixture);
    expect(rows(el)).toHaveLength(2);
    expect(byTestId(el, 'unsupported-notice')).not.toBeNull();
  });

  it('is separate from weight history and the profile: shows neither, changes neither', async () => {
    const { el, storage, profileBefore } = await renderHistory(envelope([OLDER]));
    expect(el.textContent).not.toMatch(/kg|81\.5/);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
  });

  it('is reached from You', async () => {
    const { forward } = configure(null);
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=measurements-entry]')!;
    expect(clean(button)).toBe('Measurements Your recorded body measurements');
    button.click();
    expect(forward).toHaveBeenCalledWith('/you/measurements');
  });
});
