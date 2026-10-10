import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { BODY_COMPOSITION_ASSESSMENT_ID } from '../../core/body-composition/body-composition-history.service';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { BodyCompositionAssessment } from '../../domain/body-composition';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { BodyCompositionEntryPage } from './body-composition-entry.page';

const KEY = 'fitness.body-composition-assessments';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const MEASUREMENT_KEY = 'fitness.body-measurement-entries';
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
const WEIGHTS = JSON.stringify({ version: 1, entries: [{ id: 'w', date: '2026-10-01', weight: { kilograms: 82 } }] });
const MEASUREMENTS = JSON.stringify({ version: 1, entries: [{ id: 'm', date: '2026-10-01', values: { waist: { centimeters: 80 } } }] });
const IMPORTED: BodyCompositionAssessment = {
  id: 'imported',
  date: '2026-10-01',
  source: { device: 'inbody', entryMethod: 'import', format: 'inbody-570-result-sheet', parser: { name: 'inbody-pdf', version: '0.1.0' } },
  reported: { weight: { value: 81.37, unit: 'kg' } },
  createdAt: '2026-10-01T06:00:00.000Z',
  updatedAt: '2026-10-01T06:00:00.000Z',
};
const METRICS = ['weight', 'body-fat-mass', 'lean-body-mass', 'body-fat-percentage'];

function configure(raw: string | null, profile: UserFitnessProfile | null) {
  const storage = new MemoryKeyValueStorage();
  if (raw !== null) {
    storage.values.set(KEY, raw);
  }
  storage.values.set(WEIGHT_KEY, WEIGHTS);
  storage.values.set(MEASUREMENT_KEY, MEASUREMENTS);
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
      { provide: BODY_COMPOSITION_ASSESSMENT_ID, useValue: () => `new-${++ids}` },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    profileBefore: storage.values.get(PROFILE_KEY),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
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
const stored = (storage: MemoryKeyValueStorage): unknown[] => JSON.parse(storage.values.get(KEY) ?? '{"assessments":[]}').assessments;

async function renderForm(raw: string | null = null, profile: UserFitnessProfile | null = PROFILE) {
  const spies = configure(raw, profile);
  const fixture = TestBed.createComponent(BodyCompositionEntryPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const input = (field: string) => byTestId(el, `field-${field}`)!.querySelector('input')!;
  const type = (field: string, value: string) => {
    input(field).value = value;
    input(field).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const unit = (field: string) => clean(byTestId(el, `field-${field}`)?.querySelector('.suffix'));
  const chooseUnit = (value: 'kg' | 'lb') => {
    const radio = byTestId(el, 'mass-unit')!.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const error = (field: string) => clean(byTestId(el, `field-${field}`)?.querySelector('.message.error'));
  const submit = async () => {
    byTestId(el, 'body-composition-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };
  return { ...spies, fixture, el, input, type, unit, chooseUnit, error, submit };
}

describe('Body composition entry page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows each supported metric in the report’s unit, and today’s date', async () => {
    const { el, input, unit } = await renderForm();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Add body composition');
    expect(clean(el.querySelector('legend.legend'))).toBe('Report values');
    for (const metric of METRICS) {
      expect(input(metric).getAttribute('inputmode')).toBe('decimal');
      expect(input(metric).value).toBe('');
    }
    expect(METRICS.map(unit)).toEqual(['kg', 'kg', 'kg', '%']);
    expect(input('date').type).toBe('date');
    expect(input('date').value).toBe('2026-10-09');
    expect(input('date').getAttribute('max')).toBe('2026-10-09');
    expect(clean(el.querySelector('.note'))).toBe('Saved to your body composition only. Your profile, weight history and measurements stay the same.');
  });

  it('defaults masses to lb for an imperial profile, and kg without a profile', async () => {
    const imperial = await renderForm(null, { ...PROFILE, unitSystem: 'imperial' });
    expect(imperial.unit('weight')).toBe('lb');
    TestBed.resetTestingModule();
    const none = await renderForm(null, null);
    expect(none.unit('weight')).toBe('kg');
  });

  it('saves a manual assessment with values exactly as typed, then returns to the history', async () => {
    const { type, submit, storage, back } = await renderForm();
    type('weight', '80.25');
    type('body-fat-percentage', '22,45');
    type('date', '2026-10-08');
    await submit();
    expect(stored(storage)).toEqual([
      {
        id: 'new-1',
        date: '2026-10-08',
        source: { device: 'inbody', entryMethod: 'manual' },
        reported: { weight: { value: 80.25, unit: 'kg' }, 'body-fat-percentage': { value: 22.45, unit: '%' } },
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
    expect(back).toHaveBeenCalledWith('/you/body-composition');
  });

  it('saves masses in the chosen unit without converting', async () => {
    const { type, unit, chooseUnit, submit, storage } = await renderForm();
    chooseUnit('lb');
    expect(unit('lean-body-mass')).toBe('lb');
    expect(unit('body-fat-percentage')).toBe('%');
    type('weight', '176.83');
    type('lean-body-mass', '137.6');
    await submit();
    expect((stored(storage)[0] as BodyCompositionAssessment).reported).toEqual({
      weight: { value: 176.83, unit: 'lb' },
      'lean-body-mass': { value: 137.6, unit: 'lb' },
    });
  });

  it('requires at least one value, with an accessible group message; nothing is saved', async () => {
    const { el, input, type, submit, storage, back } = await renderForm();
    await submit();
    const message = byTestId(el, 'values-error')!;
    expect(clean(message)).toBe('Enter at least one value from your report.');
    for (const metric of METRICS) {
      expect(input(metric).getAttribute('aria-invalid')).toBe('true');
      expect(input(metric).getAttribute('aria-describedby')).toContain(message.id);
    }
    expect(document.activeElement).toBe(input('weight'));
    expect(clean(byTestId(el, 'form-status'))).toBe('Check the highlighted fields.');
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();

    type('body-fat-mass', '18');
    expect(byTestId(el, 'values-error')).toBeNull();
  });

  it('shows range, number and date errors in the chosen unit, focusing the first', async () => {
    const { el, input, type, chooseUnit, error, submit, storage } = await renderForm();
    chooseUnit('lb');
    type('weight', '30');
    type('body-fat-mass', 'lots');
    type('lean-body-mass', '1200');
    type('body-fat-percentage', '100');
    type('date', '2026-10-12');
    await submit();
    expect(error('weight')).toBe('Enter a weight between 45 and 1,102 lb.');
    expect(error('body-fat-mass')).toBe('Enter body fat mass as a number, like 22.4.');
    expect(error('lean-body-mass')).toBe('Enter a lean body mass above 0 and up to 1,102 lb.');
    expect(error('body-fat-percentage')).toBe('Enter a body fat percentage above 0 and below 100.');
    expect(error('date')).toBe("The date can't be in the future.");
    expect(document.activeElement).toBe(input('weight'));
    expect(storage.values.has(KEY)).toBe(false);

    chooseUnit('kg');
    expect(error('weight')).toBe('');
    expect(error('body-fat-percentage')).toBe('Enter a body fat percentage above 0 and below 100.');
    expect(el.querySelector('[data-testid="field-date"] .message.error')).not.toBeNull();
  });

  it('never saves an ambiguous number', async () => {
    const { type, error, submit, storage } = await renderForm();
    type('weight', '1,234');
    await submit();
    expect(error('weight')).toBe("Check number format. Use one decimal separator. Thousands separators aren't supported.");
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('a failed save is announced and the form stays', async () => {
    const { el, type, submit, storage, back } = await renderForm();
    storage.failWrites = true;
    type('weight', '80');
    await submit();
    expect(clean(byTestId(el, 'form-status'))).toBe("Your assessment couldn't be saved, so nothing was changed. Please try again.");
    expect(back).not.toHaveBeenCalled();
    expect(storage.values.has(KEY)).toBe(false);
  });

  it.each([
    ['corrupt', '{oops'],
    ['from a newer version', JSON.stringify({ version: 2, assessments: [] })],
  ])('a %s store shows an error, offers no form and is never overwritten', async (_, raw) => {
    const { el, storage } = await renderForm(raw);
    expect(byTestId(el, 'load-error')).not.toBeNull();
    expect(byTestId(el, 'body-composition-form')).toBeNull();
    expect(byTestId(el, 'save')).toBeNull();
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('adds alongside an imported assessment without touching it or any other data', async () => {
    const existing = JSON.stringify({ version: 1, assessments: [IMPORTED] });
    const { type, submit, storage, profileBefore } = await renderForm(existing);
    const save = vi.spyOn(TestBed.inject(FitnessProfileService), 'save');
    type('weight', '80');
    await submit();
    const [imported, manual] = stored(storage) as BodyCompositionAssessment[];
    expect(imported).toEqual(IMPORTED);
    expect(manual.source).toEqual({ device: 'inbody', entryMethod: 'manual' });
    expect(save).not.toHaveBeenCalled();
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    expect(storage.values.get(MEASUREMENT_KEY)).toBe(MEASUREMENTS);
  });
});
