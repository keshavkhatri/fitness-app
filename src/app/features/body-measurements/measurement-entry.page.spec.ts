import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { MeasurementHistoryRepository } from '../../core/body-measurements/measurement-history.repository';
import { MEASUREMENT_ENTRY_ID, MeasurementHistoryService } from '../../core/body-measurements/measurement-history.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { MeasurementEntry, MeasurementValues } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { MeasurementEntryPage } from './measurement-entry.page';

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
  entries: [{ id: 'w', date: '2026-10-01', weight: { kilograms: 82 }, createdAt: '2026-10-01T06:00:00.000Z', updatedAt: '2026-10-01T06:00:00.000Z' }],
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
const FORMAT = "Check number format. Use one decimal separator. Thousands separators aren't supported.";
const SITES = ['waist', 'chest', 'hips', 'arm', 'thigh'];

function configure(raw: string | null, profile: UserFitnessProfile | null = PROFILE) {
  const storage = new MemoryKeyValueStorage();
  if (raw !== null) {
    storage.values.set(KEY, raw);
  }
  storage.values.set(WEIGHT_KEY, WEIGHTS);
  if (profile) {
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile }));
  }
  let ids = 0;
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: MEASUREMENT_ENTRY_ID, useValue: () => `new-${++ids}` },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    profileBefore: storage.values.get(PROFILE_KEY),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
  };
}

const envelope = (entries: readonly unknown[]) => JSON.stringify({ version: 1, entries });

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
const stored = (storage: MemoryKeyValueStorage): MeasurementEntry[] => JSON.parse(storage.values.get(KEY) ?? '{"entries":[]}').entries;

async function renderForm(raw: string | null, entryId?: string, profile?: UserFitnessProfile | null, before?: () => void) {
  const spies = configure(raw, profile);
  before?.();
  const fixture = TestBed.createComponent(MeasurementEntryPage);
  if (entryId) {
    fixture.componentRef.setInput('entryId', entryId);
  }
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const input = (field: string) => byTestId(el, `field-${field}`)!.querySelector('input')!;
  const type = (field: string, value: string) => {
    input(field).value = value;
    input(field).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const error = (field: string) => clean(byTestId(el, `field-${field}`)?.querySelector('.message.error'));
  const submit = async () => {
    byTestId(el, 'measurement-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };
  return { ...spies, fixture, el, input, type, error, submit };
}

describe('Measurement entry page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds a measuring session with any subset of sites, stored in centimeters', async () => {
    const { el, input, type, submit, storage, back } = await renderForm(null);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Add measurements');
    expect(clean(el.querySelector('legend'))).toBe('Measurements');
    for (const site of SITES) {
      expect(input(site).getAttribute('inputmode')).toBe('decimal');
      expect(input(site).value).toBe('');
      expect(clean(byTestId(el, `field-${site}`)?.querySelector('.suffix'))).toBe('cm');
    }
    expect(input('date').type).toBe('date');
    expect(input('date').value).toBe('2026-10-09');
    expect(input('date').getAttribute('max')).toBe('2026-10-09');

    type('waist', '80,5');
    type('arm', '33');
    type('date', '2026-10-08');
    await submit();
    expect(stored(storage)).toEqual([
      {
        id: 'new-1',
        date: '2026-10-08',
        values: { waist: { centimeters: 80.5 }, arm: { centimeters: 33 } },
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
    expect(back).toHaveBeenCalledWith('/you/measurements');
  });

  it('asks for the same side each time for arm and thigh', async () => {
    const { el, input } = await renderForm(null);
    const hint = (site: string) => clean(byTestId(el, `field-${site}`)?.querySelector('.message'));
    expect(hint('arm')).toBe('One arm only. Measure the same arm each time.');
    expect(hint('thigh')).toBe('One thigh only. Measure the same thigh each time.');
    expect(input('arm').getAttribute('aria-describedby')).toBe(byTestId(el, 'field-arm')!.querySelector('.message')!.id);
    expect(clean(el.querySelector('.note'))).toBe('Saved to your measurements only. Your profile and weight history stay the same.');
  });

  it('inches are shown and entered in the profile’s unit, and stored as centimeters', async () => {
    const { el, type, submit, storage } = await renderForm(null, undefined, { ...PROFILE, unitSystem: 'imperial' });
    expect(clean(byTestId(el, 'field-waist')?.querySelector('.suffix'))).toBe('in');
    type('waist', '32');
    type('thigh', '22.5');
    await submit();
    expect(stored(storage)[0].values).toEqual({ waist: { centimeters: 81.28 }, thigh: { centimeters: 57.15 } });
  });

  it('requires at least one measurement, with an accessible group message; nothing is saved', async () => {
    const { el, input, type, submit, storage, back } = await renderForm(null);
    await submit();
    const message = byTestId(el, 'values-error')!;
    expect(clean(message)).toBe('Enter at least one measurement.');
    for (const site of SITES) {
      expect(input(site).getAttribute('aria-invalid')).toBe('true');
      expect(input(site).getAttribute('aria-describedby')).toContain(message.id);
    }
    expect(document.activeElement).toBe(input('waist'));
    expect(clean(byTestId(el, 'form-status'))).toBe('Check the highlighted fields.');
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();

    type('hips', '98');
    expect(byTestId(el, 'values-error')).toBeNull();
    expect(input('waist').getAttribute('aria-invalid')).toBeNull();
  });

  it('shows per-site and date errors in the user’s unit, focusing the first', async () => {
    const metric = await renderForm(null);
    metric.type('chest', '5');
    metric.type('thigh', 'thick');
    metric.type('date', '2026-10-12');
    await metric.submit();
    expect(metric.error('chest')).toBe('Enter a chest measurement between 10 and 300 cm.');
    expect(metric.error('thigh')).toBe('Enter your thigh as a number, like 80.5.');
    expect(metric.error('date')).toBe("The date can't be in the future.");
    expect(metric.input('chest').getAttribute('aria-invalid')).toBe('true');
    const messageId = byTestId(metric.el, 'field-chest')!.querySelector('.message.error')!.id;
    expect(metric.input('chest').getAttribute('aria-describedby')).toContain(messageId);
    // The first invalid field on screen: the date sits above the measurements.
    expect(document.activeElement).toBe(metric.input('date'));
    expect(byTestId(metric.el, 'values-error')).toBeNull();
    expect(metric.storage.values.has(KEY)).toBe(false);

    TestBed.resetTestingModule();
    const imperial = await renderForm(null, undefined, { ...PROFILE, unitSystem: 'imperial' });
    imperial.type('waist', '200');
    await imperial.submit();
    expect(imperial.error('waist')).toBe('Enter a waist measurement between 4 and 118 in.');
  });

  it('rejects an ambiguous number visibly instead of guessing', async () => {
    const { type, error, submit, storage, back } = await renderForm(null);
    type('waist', '80.500');
    await submit();
    expect(error('waist')).toBe(FORMAT);
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('edits an entry: same id and creation time, new values; a cleared site is removed', async () => {
    const original = entry('a', '2026-10-07', { waist: { centimeters: 81.6 }, hips: { centimeters: 99 } });
    const { el, input, type, submit, storage, back } = await renderForm(envelope([original]), 'a');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Edit measurements');
    expect(input('waist').value).toBe('81.6');
    expect(input('hips').value).toBe('99');
    expect(input('chest').value).toBe('');
    expect(input('date').value).toBe('2026-10-07');
    expect(clean(byTestId(el, 'save'))).toBe('Save changes');

    type('waist', '81.2');
    type('hips', '');
    type('arm', '34');
    await submit();
    expect(stored(storage)).toEqual([
      { ...original, values: { waist: { centimeters: 81.2 }, arm: { centimeters: 34 } }, updatedAt: NOW.toISOString() },
    ]);
    expect(back).toHaveBeenCalledWith('/you/measurements');
  });

  it('unchanged sites keep their stored centimeters exactly when edited in inches', async () => {
    const original = entry('a', '2026-10-07', { waist: { centimeters: 81.33 }, chest: { centimeters: 100 } });
    const { input, type, submit, storage } = await renderForm(envelope([original]), 'a', { ...PROFILE, unitSystem: 'imperial' });
    expect(input('waist').value).toBe('32');
    type('chest', '40');
    type('date', '2026-10-06');
    await submit();
    expect(stored(storage)[0]).toMatchObject({
      id: 'a',
      date: '2026-10-06',
      values: { waist: { centimeters: 81.33 }, chest: { centimeters: 101.6 } },
      createdAt: original.createdAt,
    });
  });

  it('editing to no measurements at all is refused', async () => {
    const original = entry('a', '2026-10-07', { waist: { centimeters: 81 } });
    const { el, type, submit, storage } = await renderForm(envelope([original]), 'a');
    type('waist', '');
    await submit();
    expect(clean(byTestId(el, 'values-error'))).toBe('Enter at least one measurement.');
    expect(stored(storage)).toEqual([original]);
  });

  it('a failed save is reported, claims nothing, and keeps the input', async () => {
    const { input, type, submit, storage, back, el } = await renderForm(null);
    type('waist', '80.4');
    storage.failWrites = true;
    await submit();
    expect(clean(byTestId(el, 'form-status'))).toBe("Your measurements couldn't be saved, so nothing was changed. Please try again.");
    expect(input('waist').value).toBe('80.4');
    expect(back).not.toHaveBeenCalled();
    expect(storage.values.has(KEY)).toBe(false);
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('an entry deleted meanwhile is a failed save, not a success', async () => {
    const original = entry('a', '2026-10-07', { waist: { centimeters: 81 } });
    const { type, submit, storage, back, el } = await renderForm(envelope([original]), 'a');
    storage.values.set(KEY, envelope([]));
    type('waist', '80');
    await submit();
    expect(clean(byTestId(el, 'form-status'))).toContain("couldn't be saved");
    expect(stored(storage)).toEqual([]);
    expect(back).not.toHaveBeenCalled();
  });

  it('a second Save after a successful one (a double click) saves nothing more', async () => {
    const { el, type, submit, storage } = await renderForm(null);
    type('waist', '80.4');
    await submit();
    await submit();
    expect(JSON.parse(storage.values.get(KEY)!).entries).toHaveLength(1);
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Save and Cancel while a write is in progress and prevents double submission', async () => {
    const { el, type, fixture, storage } = await renderForm(null);
    let release!: () => void;
    const repository = TestBed.inject(MeasurementHistoryRepository);
    const realAdd = repository.add.bind(repository);
    vi.spyOn(repository, 'add').mockImplementation(async (e) => {
      await new Promise<void>((r) => (release = r));
      return realAdd(e);
    });
    const add = vi.spyOn(TestBed.inject(MeasurementHistoryService), 'add');
    type('waist', '80.4');
    byTestId(el, 'measurement-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(true);
    expect((byTestId(el, 'cancel') as HTMLButtonElement).disabled).toBe(true);
    byTestId(el, 'measurement-form')!.dispatchEvent(new Event('submit'));
    (byTestId(el, 'cancel') as HTMLButtonElement).click();
    release();
    await settle(fixture);
    expect(add).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toHaveLength(1);
  });

  it('cancel leaves without saving', async () => {
    const { el, type, storage, back } = await renderForm(null);
    type('waist', '80');
    (byTestId(el, 'cancel') as HTMLButtonElement).click();
    expect(back).toHaveBeenCalledWith('/you/measurements');
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('loading state', async () => {
    configure(null);
    vi.spyOn(TestBed.inject(MeasurementHistoryRepository), 'list').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(MeasurementEntryPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(el.querySelector('[role=status]'))).toBe('Loading measurements');
    expect(byTestId(el, 'save')).toBeNull();
  });

  it('an unknown entry id is reported as not found', async () => {
    const { el, back } = await renderForm(envelope([]), 'gone');
    expect(clean(byTestId(el, 'not-found'))).toContain('Entry not found');
    expect(byTestId(el, 'save')).toBeNull();
    byTestId(el, 'not-found')!.querySelector('button')!.click();
    expect(back).toHaveBeenCalledWith('/you/measurements');
  });

  it('an entry with unknown sites is explained as unsupported and left untouched', async () => {
    const raw = envelope([UNKNOWN_SITE]);
    const { el, storage } = await renderForm(raw, 'future');
    expect(clean(byTestId(el, 'unsupported'))).toContain('This entry can’t be shown');
    expect(clean(byTestId(el, 'unsupported'))).toContain('kept exactly as it is');
    expect(byTestId(el, 'measurement-form')).toBeNull();
    expect(byTestId(el, 'save')).toBeNull();
    expect(el.querySelector('[data-testid=unsupported] button')?.textContent?.trim()).toBe('Back to measurements');
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('adding beside an unsupported entry keeps it exactly', async () => {
    const { type, submit, storage } = await renderForm(envelope([UNKNOWN_SITE]));
    type('waist', '80');
    await submit();
    const entries = stored(storage);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(UNKNOWN_SITE);
  });

  it('corrupt or newer-version storage explains that nothing can be saved, and is never overwritten', async () => {
    for (const raw of ['{not json', JSON.stringify({ version: 2, entries: [] }), JSON.stringify([1, 2])]) {
      TestBed.resetTestingModule();
      const { el, storage, back } = await renderForm(raw);
      const card = byTestId(el, 'load-error')!;
      expect(clean(card)).toContain("Your measurements can't be read right now");
      expect(clean(card)).toContain("measurements can't be saved at the moment. Nothing has been changed or deleted.");
      expect(byTestId(el, 'measurement-form')).toBeNull();
      expect(byTestId(el, 'save')).toBeNull();
      expect([...card.querySelectorAll('button')].map((b) => clean(b))).toEqual(['Try again', 'Back to measurements']);
      expect(storage.values.get(KEY)).toBe(raw);
      expect(back).not.toHaveBeenCalled();
    }
  });

  it('retrying after a read failure recovers', async () => {
    const { el, fixture } = await renderForm(null, undefined, PROFILE, () => {
      vi.spyOn(TestBed.inject(MeasurementHistoryRepository), 'list').mockRejectedValueOnce(new Error('boom'));
    });
    const card = byTestId(el, 'load-error')!;
    [...card.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(byTestId(el, 'measurement-form')).not.toBeNull();
  });

  it('storage that became unreadable after loading fails the save and stays as it is', async () => {
    const { type, submit, storage, back, el } = await renderForm(null);
    storage.values.set(KEY, '{broken');
    type('waist', '80');
    await submit();
    expect(clean(byTestId(el, 'form-status'))).toContain("couldn't be saved");
    expect(storage.values.get(KEY)).toBe('{broken');
    expect(back).not.toHaveBeenCalled();
  });

  it('adding and editing never change the profile or weight history', async () => {
    const { type, submit, storage, profileBefore, fixture } = await renderForm(null);
    type('waist', '80');
    await submit();
    const [saved] = stored(storage);
    await TestBed.inject(MeasurementHistoryService).update(saved, { values: { waist: 79 }, unitSystem: 'metric', date: '2026-10-09' });
    await settle(fixture);
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
  });
});
