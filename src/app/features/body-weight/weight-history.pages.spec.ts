import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { WeightHistoryRepository } from '../../core/body-measurements/weight-history.repository';
import { WEIGHT_ENTRY_ID, WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { WeightEntry } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { BottomSheetComponent } from '../../shared/ui';
import { YouPage } from '../you/you.page';
import { WeightEntryPage } from './weight-entry.page';
import { WeightHistoryPage } from './weight-history.page';
import { weightChart } from './weight-trend-view-model';

const KEY = 'fitness.body-weight-entries';
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
const entry = (id: string, date: string, kilograms: number, createdAt = `${date}T06:00:00.000Z`): WeightEntry => ({
  id,
  date,
  weight: { kilograms },
  createdAt,
  updatedAt: createdAt,
});
const FORMAT = "Check number format. Use one decimal separator. Thousands separators aren't supported.";

function configure(entries: readonly WeightEntry[], profile: UserFitnessProfile | null = PROFILE) {
  const storage = new MemoryKeyValueStorage();
  if (entries.length) {
    storage.values.set(KEY, JSON.stringify({ version: 1, entries }));
  }
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
      { provide: WEIGHT_ENTRY_ID, useValue: () => `new-${++ids}` },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    profileBefore: storage.values.get(PROFILE_KEY),
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
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
const stored = (storage: MemoryKeyValueStorage): WeightEntry[] => JSON.parse(storage.values.get(KEY) ?? '{"entries":[]}').entries;

async function renderHistory(entries: readonly WeightEntry[], profile?: UserFitnessProfile | null, before?: () => void) {
  const spies = configure(entries, profile);
  before?.();
  const fixture = TestBed.createComponent(WeightHistoryPage);
  await settle(fixture);
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Body weight history page', () => {
  it('lists weigh-ins newest first with the change since the previous entry', async () => {
    const { el } = await renderHistory([
      entry('a', '2026-10-01', 82.0),
      entry('c', '2026-10-09', 80.9),
      entry('b', '2026-10-08', 81.6),
    ]);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Body weight');
    expect(clean(el.querySelector('.subtitle'))).toContain('doesn’t change the weight in your profile');
    const rows = [...el.querySelectorAll('[data-testid=weight-row]')];
    expect(rows.map((r) => clean(r))).toEqual([
      '80.9 kg Today −0.7 kg since previous entry',
      '81.6 kg Yesterday −0.4 kg since previous entry',
      '82.0 kg Thursday, Oct 1 First entry',
    ]);
    expect(rows[0].getAttribute('aria-label')).toBe('Edit 80.9 kg, Today. −0.7 kg since previous entry');
    expect(el.textContent).not.toMatch(/lost|gained|progress|trend|%/i);
  });

  it('shows weights and differences in the profile’s units (stored kilograms unchanged)', async () => {
    const { el } = await renderHistory([entry('a', '2026-10-07', 80), entry('b', '2026-10-08', 80.2)], { ...PROFILE, unitSystem: 'imperial' });
    expect([...el.querySelectorAll('[data-testid=weight-row]')].map((r) => clean(r))).toEqual([
      '176.8 lb Yesterday +0.4 lb since previous entry',
      '176.4 lb Wednesday, Oct 7 First entry',
    ]);
  });

  it('labels same-day differences as such, and an unchanged weight as no change', async () => {
    const { el } = await renderHistory([
      entry('am', '2026-10-09', 80.4, '2026-10-09T05:00:00.000Z'),
      entry('pm', '2026-10-09', 80.8, '2026-10-09T18:00:00.000Z'),
      entry('old', '2026-10-05', 80.4),
    ]);
    expect([...el.querySelectorAll('[data-testid=weight-change]')].map((c) => clean(c))).toEqual([
      '+0.4 kg since previous entry (same day)',
      'No change since previous entry',
      'First entry',
    ]);
  });

  it('opens add and edit', async () => {
    const { el, fixture, forward } = await renderHistory([entry('a', '2026-10-08', 81)]);
    (byTestId(el, 'add-weight') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    (byTestId(el, 'weight-row') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'a']);
  });

  it('an empty history invites the first entry', async () => {
    const { el, forward } = await renderHistory([]);
    const empty = byTestId(el, 'weight-empty')!;
    expect(clean(empty)).toContain('No weigh-ins yet');
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Add weight')!.click();
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    expect(el.querySelector('[data-testid=weight-row]')).toBeNull();
  });

  it('loading state', async () => {
    configure([]);
    vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(WeightHistoryPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(el, 'announcement'))).toBe('Loading your weight history');
  });

  it('a read failure offers Retry', async () => {
    const { el, fixture } = await renderHistory([entry('a', '2026-10-08', 81)], PROFILE, () => {
      vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockRejectedValueOnce(new Error('boom'));
    });
    expect(clean(byTestId(el, 'weight-error'))).toContain("We couldn't load your weight history");
    [...byTestId(el, 'weight-error')!.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(el.querySelectorAll('[data-testid=weight-row]')).toHaveLength(1);
  });

  it('is reached from You', async () => {
    const { forward } = configure([]);
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=weight-history-entry]')!;
    expect(clean(button)).toBe('Weight Track your weight');
    button.click();
    expect(forward).toHaveBeenCalledWith('/you/weight-history');
  });
});

describe('Body weight trend (history page)', () => {
  afterEach(() => vi.restoreAllMocks());
  const chooseRange = (fixture: ComponentFixture<unknown>, value: '30d' | '90d' | 'all') => {
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLInputElement>(`fit-segmented-control input[value="${value}"]`)!.click();
    fixture.detectChanges();
  };
  const summaryText = (el: HTMLElement) => clean(byTestId(el, 'trend-summary'));
  const measurements = (el: HTMLElement) => [...(byTestId(el, 'trend-measurements')?.querySelectorAll('li') ?? [])].map((li) => clean(li));
  const SPREAD = [entry('old', '2026-03-01', 86), entry('mid', '2026-08-01', 83.5), entry('recent', '2026-10-01', 82.2), entry('now', '2026-10-09', 81.9)];

  it('offers five keyboard-operable ranges, 30 days by default', async () => {
    const { el } = await renderHistory(SPREAD);
    const radios = [...el.querySelectorAll<HTMLInputElement>('fit-segmented-control input[type=radio]')];
    expect(radios.map((r) => [r.value, clean(r.closest('label'))])).toEqual([
      ['30d', '1M'],
      ['90d', '3M'],
      ['180d', '6M'],
      ['365d', '1Y'],
      ['all', 'All'],
    ]);
    expect(radios.find((r) => r.checked)?.value).toBe('30d');
    // Short labels, full names for screen readers.
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['The last 30 days', 'The last 90 days', 'The last 180 days', 'The last year', 'All time']);
    expect(clean(el.querySelector('fit-segmented-control legend'))).toBe('Time range');
  });

  it('switching ranges filters the chart and summary; the full list stays', async () => {
    const { el, fixture } = await renderHistory(SPREAD);
    expect(el.querySelectorAll('[data-testid=chart-point]')).toHaveLength(2);
    expect(summaryText(el)).toBe('Latest 81.9 kg Today Change −0.3 kg From 82.2 kg, Thursday, Oct 1 Lowest 81.9 kg Today Highest 82.2 kg Thursday, Oct 1');

    chooseRange(fixture, '90d');
    expect(el.querySelectorAll('[data-testid=chart-point]')).toHaveLength(3);
    expect(clean(byTestId(el, 'trend-change'))).toBe('−1.6 kg');

    chooseRange(fixture, 'all');
    expect(el.querySelectorAll('[data-testid=chart-point]')).toHaveLength(4);
    expect(summaryText(el)).toContain('From 86.0 kg, Sunday, Mar 1');
    expect(summaryText(el)).toContain('Highest 86.0 kg Sunday, Mar 1');
    expect(clean(byTestId(el, 'trend-change'))).toBe('−4.1 kg');

    expect(el.querySelectorAll('[data-testid=weight-row]')).toHaveLength(4);
  });

  it('a range without measurements shows an empty state with Add weight; nothing is invented', async () => {
    const { el, forward } = await renderHistory([entry('old', '2026-03-01', 86)]);
    const empty = byTestId(el, 'trend-empty')!;
    expect(clean(empty)).toContain('No weigh-ins in the last 30 days');
    expect(byTestId(el, 'point-chart')).toBeNull();
    expect(byTestId(el, 'trend-summary')).toBeNull();
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Add weight')!.click();
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    expect(el.querySelectorAll('[data-testid=weight-row]')).toHaveLength(1);
  });

  it('a single measurement is one visible point and claims no change', async () => {
    const { el } = await renderHistory([entry('only', '2026-10-09', 80)]);
    expect(el.querySelectorAll('[data-testid=chart-point]')).toHaveLength(1);
    expect(byTestId(el, 'chart-line')).toBeNull();
    expect(byTestId(el, 'trend-change')).toBeNull();
    expect(summaryText(el)).toContain('Only one measurement in this range');
  });

  it('keeps every same-day measurement as its own point and text item', async () => {
    const { el } = await renderHistory([
      entry('am', '2026-10-09', 80.2, '2026-10-09T05:00:00.000Z'),
      entry('pm', '2026-10-09', 80.8, '2026-10-09T18:00:00.000Z'),
    ]);
    const points = [...el.querySelectorAll('[data-testid=chart-point]')];
    expect(points).toHaveLength(2);
    expect(points[0].getAttribute('cx')).not.toBe(points[1].getAttribute('cx'));
    expect(measurements(el)).toEqual(['80.2 kg, Today', '80.8 kg, Today']);
  });

  it('describes the chart for screen readers and lists its measurements as text', async () => {
    const { el } = await renderHistory(SPREAD);
    const svg = byTestId(el, 'point-chart')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(
      'Weight chart for the last 30 days: 2 measurements, from 82.2 kg (Thursday, Oct 1) to 81.9 kg (Today). Change between first and latest recorded measurements: −0.3 kg.',
    );
    expect(byTestId(el, 'trend-measurements')?.getAttribute('aria-label')).toBe('Measurements in this range');
    expect(measurements(el)).toEqual(['82.2 kg, Thursday, Oct 1', '81.9 kg, Today']);
  });

  it('uses the profile’s unit everywhere in the trend', async () => {
    const { el } = await renderHistory([entry('a', '2026-10-01', 80), entry('b', '2026-10-09', 79.5)], { ...PROFILE, unitSystem: 'imperial' });
    expect(summaryText(el)).toBe('Latest 175.3 lb Today Change −1.1 lb From 176.4 lb, Thursday, Oct 1 Lowest 175.3 lb Today Highest 176.4 lb Thursday, Oct 1');
    expect(clean(el.querySelector('fit-point-chart .caption'))).toBe('Weight (lb)');
  });

  it('if the chart can’t be built, the summary, text and list remain', async () => {
    vi.spyOn(weightChart, 'build').mockImplementation(() => {
      throw new Error('render');
    });
    const { el } = await renderHistory(SPREAD);
    expect(byTestId(el, 'point-chart')).toBeNull();
    expect(clean(byTestId(el, 'chart-unavailable'))).toContain('The chart can’t be shown right now');
    expect(summaryText(el)).toContain('Latest 81.9 kg Today');
    expect(measurements(el)).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid=weight-row]')).toHaveLength(4);
  });

  it('adding, editing and deleting update the chart and summary; the chosen range is kept', async () => {
    const { el, fixture } = await renderHistory([entry('a', '2026-10-01', 82)]);
    chooseRange(fixture, '90d');
    const service = TestBed.inject(WeightHistoryService);
    const added = await service.add({ weight: 81, unitSystem: 'metric', date: '2026-10-09' });
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=chart-point]')).toHaveLength(2);
    expect(clean(byTestId(el, 'trend-change'))).toBe('−1.0 kg');
    if (!added.ok) {
      throw new Error('fixture');
    }
    await service.update(added.entry, { weight: 82.5, unitSystem: 'metric', date: '2026-10-09' });
    fixture.detectChanges();
    expect(clean(byTestId(el, 'trend-change'))).toBe('+0.5 kg');
    const state = service.state();
    if (state.status !== 'ready') {
      throw new Error(state.status);
    }
    await service.remove(state.entries[0]);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid=chart-point]')).toHaveLength(1);
    expect(el.querySelector<HTMLInputElement>('fit-segmented-control input:checked')?.value).toBe('90d');
  });

  it('calls out the latest measurement on the chart; the page uses the dashboard theme', async () => {
    const { el, fixture } = await renderHistory(SPREAD);
    expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-dashboard');
    expect(clean(el.querySelector('.value.latest'))).toBe('81.9');
    expect(clean(el.querySelector('.date.latest'))).toBe('9 Oct');
  });

  it('no history at all keeps the original empty state (no range controls)', async () => {
    const { el } = await renderHistory([]);
    expect(byTestId(el, 'weight-empty')).not.toBeNull();
    expect(byTestId(el, 'weight-trend')).toBeNull();
  });
});

describe('Weight entry page', () => {
  async function renderForm(entries: readonly WeightEntry[], entryId?: string, profile?: UserFitnessProfile | null, before?: () => void) {
    const spies = configure(entries, profile);
    before?.();
    const fixture = TestBed.createComponent(WeightEntryPage);
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
      byTestId(el, 'weight-form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);
    };
    return { ...spies, fixture, el, input, type, error, submit };
  }

  it('adds a weigh-in (decimal comma, chosen date), stored in kilograms', async () => {
    const { el, input, type, submit, storage, back } = await renderForm([]);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Add weight');
    expect(input('weight').getAttribute('inputmode')).toBe('decimal');
    expect(clean(byTestId(el, 'field-weight')?.querySelector('.suffix'))).toBe('kg');
    expect(input('date').type).toBe('date');
    expect(input('date').value).toBe('2026-10-09');
    expect(input('date').getAttribute('max')).toBe('2026-10-09');
    expect(byTestId(el, 'delete')).toBeNull();

    type('weight', '80,4');
    type('date', '2026-10-08');
    await submit();
    expect(stored(storage)).toEqual([
      { id: 'new-1', date: '2026-10-08', weight: { kilograms: 80.4 }, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    ]);
    expect(back).toHaveBeenCalledWith('/you/weight-history');
  });

  it('is a dark form; the slider nudges the typed weight around the latest entry; no slider without one', async () => {
    const first = await renderForm([]);
    expect((first.fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-immersive');
    expect(byTestId(first.el, 'weight-slider')).toBeNull();
    TestBed.resetTestingModule();

    const { el, fixture, input, submit, storage } = await renderForm([entry('a', '2026-10-01', 80.4)]);
    const range = byTestId(el, 'weight-slider')!.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(range.getAttribute('aria-label')).toBe('Fine-adjust weight');
    expect([range.min, range.max, range.step, range.value]).toEqual(['70', '91', '0.1', '80.4']);
    range.value = '81.3';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input('weight').value).toBe('81.3');
    await submit();
    expect(stored(storage).map((e) => e.weight.kilograms)).toEqual([80.4, 81.3]);
  });

  it('pounds are converted to kilograms for storage', async () => {
    const { el, type, submit, storage } = await renderForm([], undefined, { ...PROFILE, unitSystem: 'imperial' });
    expect(clean(byTestId(el, 'field-weight')?.querySelector('.suffix'))).toBe('lb');
    type('weight', '180');
    await submit();
    expect(stored(storage)[0].weight).toEqual({ kilograms: 81.65 });
  });

  it('shows field errors with accessible associations, focuses the first, and saves nothing', async () => {
    const { el, input, type, error, submit, storage, back } = await renderForm([]);
    type('date', '2026-10-12');
    await submit();
    expect(error('weight')).toBe('Enter your weight.');
    expect(error('date')).toBe("The date can't be in the future.");
    expect(input('weight').getAttribute('aria-invalid')).toBe('true');
    const messageId = byTestId(el, 'field-weight')!.querySelector('.message.error')!.id;
    expect(input('weight').getAttribute('aria-describedby')).toContain(messageId);
    expect(document.activeElement).toBe(input('weight'));
    expect(clean(byTestId(el, 'form-status'))).toBe('Check the highlighted fields.');

    type('weight', '15');
    type('date', '2026-10-09');
    await submit();
    expect(error('weight')).toBe('Enter a weight between 20 and 500 kg.');
    type('weight', 'heavy');
    await submit();
    expect(error('weight')).toBe('Enter your weight as a number, like 80.4.');
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous number visibly instead of guessing', async () => {
    const { type, error, submit, storage, back } = await renderForm([]);
    type('weight', '80.400');
    await submit();
    expect(error('weight')).toBe(FORMAT);
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('edits an entry: same id and creation time, new values', async () => {
    const original = entry('a', '2026-10-07', 81.6);
    const { el, input, type, submit, storage } = await renderForm([original], 'a');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Edit weight');
    expect(input('weight').value).toBe('81.6');
    expect(input('date').value).toBe('2026-10-07');
    type('weight', '81.2');
    await submit();
    expect(stored(storage)).toEqual([{ ...original, weight: { kilograms: 81.2 }, updatedAt: NOW.toISOString() }]);
  });

  it('changing only the date keeps the stored kilograms exactly', async () => {
    const original = entry('a', '2026-10-07', 81.65);
    const { type, submit, storage } = await renderForm([original], 'a', { ...PROFILE, unitSystem: 'imperial' });
    type('date', '2026-10-06');
    await submit();
    expect(stored(storage)[0]).toMatchObject({ id: 'a', date: '2026-10-06', weight: { kilograms: 81.65 }, createdAt: original.createdAt });
  });

  it('a failed save is reported and the form keeps the input', async () => {
    const { input, type, submit, storage, back, el } = await renderForm([]);
    type('weight', '80.4');
    storage.failWrites = true;
    await submit();
    expect(clean(byTestId(el, 'form-status'))).toBe("Your weight couldn't be saved. Please try again.");
    expect(input('weight').value).toBe('80.4');
    expect(back).not.toHaveBeenCalled();
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('prevents double submission', async () => {
    const { el, type, submit, storage, fixture } = await renderForm([]);
    type('weight', '80.4');
    const add = vi.spyOn(TestBed.inject(WeightHistoryService), 'add');
    byTestId(el, 'weight-form')!.dispatchEvent(new Event('submit'));
    await submit();
    await settle(fixture);
    expect(add).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toHaveLength(1);
  });

  it('a second Save after a successful one (a double click) saves nothing more', async () => {
    const { el, type, submit, storage, fixture } = await renderForm([]);
    type('weight', '80.4');
    await submit();
    await submit();
    expect(stored(storage)).toHaveLength(1);
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(true);
    fixture.detectChanges();
  });

  it('deletes only after confirmation, and only that entry', async () => {
    const { el, fixture, storage, back } = await renderForm([entry('a', '2026-10-07', 81.6), entry('b', '2026-10-08', 81)], 'a');
    const page = fixture.componentInstance as unknown as { confirmOpen: () => boolean; cancelDelete(): void; confirmDelete(): Promise<void> };
    (byTestId(el, 'delete') as HTMLButtonElement).click();
    expect(page.confirmOpen()).toBe(true);
    page.cancelDelete();
    expect(stored(storage)).toHaveLength(2);

    (byTestId(el, 'delete') as HTMLButtonElement).click();
    await page.confirmDelete();
    expect(stored(storage).map((e) => e.id)).toEqual(['b']);
    expect(back).toHaveBeenCalledWith('/you/weight-history');
  });

  it('a failed delete keeps the entry and says so', async () => {
    const { el, fixture, storage, back } = await renderForm([entry('a', '2026-10-07', 81.6)], 'a');
    const page = fixture.componentInstance as unknown as { confirmDelete(): Promise<void> };
    storage.failWrites = true;
    await page.confirmDelete();
    fixture.detectChanges();
    expect(clean(byTestId(el, 'form-status'))).toBe("This entry couldn't be deleted. Please try again.");
    expect(stored(storage)).toHaveLength(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('unknown entry and unreadable history states', async () => {
    const missing = await renderForm([], 'gone');
    expect(clean(byTestId(missing.el, 'not-found'))).toContain('Entry not found');
    expect(byTestId(missing.el, 'save')).toBeNull();
    byTestId(missing.el, 'not-found')!.querySelector('button')!.click();
    expect(missing.back).toHaveBeenCalledWith('/you/weight-history');

    TestBed.resetTestingModule();
    const broken = await renderForm([], 'a', PROFILE, () => {
      vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockRejectedValueOnce(new Error('boom'));
    });
    expect(clean(byTestId(broken.el, 'load-error'))).toContain("We couldn't load this entry");
  });

  it('adding, editing and deleting never change the profile', async () => {
    const { type, submit, storage, profileBefore, fixture } = await renderForm([]);
    type('weight', '75');
    await submit();
    const service = TestBed.inject(WeightHistoryService);
    const [saved] = stored(storage);
    await service.update(saved, { weight: 74, unitSystem: 'metric', date: '2026-10-09' });
    await service.remove(saved);
    await settle(fixture);
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
  });
});

describe('Use as profile weight (weight entry page)', () => {
  afterEach(() => vi.restoreAllMocks());

  type Page = {
    profileSheetOpen: WritableSignal<boolean>;
    closeProfileSheet(): void;
    confirmUseAsProfileWeight(): Promise<void>;
  };

  async function renderEntry(entries: readonly WeightEntry[], entryId: string, profile: UserFitnessProfile | null = PROFILE) {
    const spies = configure(entries, profile);
    const fixture = TestBed.createComponent(WeightEntryPage);
    fixture.componentRef.setInput('entryId', entryId);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as Page;
    /** The sheet renders in an Ionic overlay outside the fixture. */
    const sheet = () => document.querySelector('[data-testid="profile-weight-sheet"]')!;
    const sheetTitle = () => clean(sheet().closest('.sheet')?.querySelector('.sheet-title'));
    const details = () => [...byTestId(sheet(), 'profile-weight-details')!.querySelectorAll('div')].map((row) => [clean(row.querySelector('dt')), clean(row.querySelector('dd'))]);
    const open = async () => {
      (byTestId(el, 'use-as-profile-weight') as HTMLButtonElement).click();
      await settle(fixture);
    };
    const confirm = async () => {
      await page.confirmUseAsProfileWeight();
      await settle(fixture);
    };
    return { ...spies, fixture, el, page, sheet, sheetTitle, details, open, confirm };
  }
  const profileOf = (storage: MemoryKeyValueStorage): UserFitnessProfile => JSON.parse(storage.values.get(PROFILE_KEY)!).profile;
  const ENTRIES = [entry('a', '2026-10-01', 82.0), entry('b', '2026-10-08', 80.45)];
  const FAILED = "Your profile weight couldn't be updated. Your saved profile hasn't changed.";

  it('is offered on a saved entry as a labelled button; not when adding', async () => {
    const { el } = await renderEntry(ENTRIES, 'b');
    const button = byTestId(el, 'use-as-profile-weight') as HTMLButtonElement;
    expect(clean(button)).toBe('Use as profile weight');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.disabled).toBe(false);

    TestBed.resetTestingModule();
    configure([]);
    const add = TestBed.createComponent(WeightEntryPage);
    await settle(add);
    expect(byTestId(add.nativeElement, 'weight-form')).not.toBeNull();
    expect(byTestId(add.nativeElement, 'use-as-profile-weight')).toBeNull();
  });

  it('is not offered without a profile (the entry stays editable)', async () => {
    const { el } = await renderEntry(ENTRIES, 'b', null);
    expect(byTestId(el, 'weight-form')).not.toBeNull();
    expect(byTestId(el, 'use-as-profile-weight')).toBeNull();
  });

  it('asks for confirmation first, showing the date, current and new weight; nothing is saved yet', async () => {
    const { open, sheet, sheetTitle, details, page, storage, profileBefore, forward } = await renderEntry(ENTRIES, 'b');
    await open();
    expect(page.profileSheetOpen()).toBe(true);
    expect(sheetTitle()).toBe('Use as profile weight?');
    const text = clean(sheet());
    expect(text).toContain('This updates the weight saved in your profile. Your calorie and macro targets may change');
    expect(details()).toEqual([
      ['Measured', 'Yesterday'],
      ['Profile weight now', '82.0 kg'],
      ['New profile weight', '80.5 kg'],
    ]);
    expect(text).toContain('Your weight history stays as it is.');
    expect(clean(byTestId(sheet(), 'confirm-profile-weight'))).toBe('Update profile weight');
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(forward).not.toHaveBeenCalled();
  });

  it('shows weights in the profile’s unit', async () => {
    const { open, details } = await renderEntry(ENTRIES, 'b', { ...PROFILE, unitSystem: 'imperial' });
    await open();
    expect(details()).toEqual([
      ['Measured', 'Yesterday'],
      ['Profile weight now', '180.8 lb'],
      ['New profile weight', '177.4 lb'],
    ]);
  });

  it('weights that differ but look the same at one decimal show the actual change', async () => {
    // 82.00 kg and 82.01 kg are both "180.8 lb".
    const { open, sheetTitle, details } = await renderEntry([entry('c', '2026-10-08', 82.01)], 'c', { ...PROFILE, unitSystem: 'imperial' });
    await open();
    expect(sheetTitle()).toBe('Use as profile weight?');
    expect(details()).toEqual([
      ['Measured', 'Yesterday'],
      ['Profile weight now', '180.78 lb'],
      ['New profile weight', '180.80 lb'],
    ]);
  });

  it('a profile edit saved while the confirmation is open is kept', async () => {
    const { open, confirm, storage, forward } = await renderEntry(ENTRIES, 'b');
    await open();
    const edited: UserFitnessProfile = { ...PROFILE, activityLevel: 'very-active', updatedAt: '2026-10-09T07:00:00.000Z' };
    await TestBed.inject(FitnessProfileService).save(edited);
    await confirm();
    expect(profileOf(storage)).toEqual({ ...edited, weight: { kilograms: 80.45 }, updatedAt: NOW.toISOString() });
    expect(forward).toHaveBeenCalledWith('/assessment');
  });

  it('cancelling leaves the profile unchanged', async () => {
    const { open, page, fixture, storage, profileBefore, forward } = await renderEntry(ENTRIES, 'b');
    await open();
    page.closeProfileSheet();
    await settle(fixture);
    expect(page.profileSheetOpen()).toBe(false);
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(forward).not.toHaveBeenCalled();
  });

  it('confirming saves only the weight (exact kilograms) and opens the updated assessment; the history is untouched', async () => {
    const { open, confirm, page, storage, forward } = await renderEntry(ENTRIES, 'b');
    const historyBefore = storage.values.get(KEY);
    await open();
    const dismiss = vi.spyOn(BottomSheetComponent.prototype, 'dismiss');
    await confirm();
    // Closed before leaving (the page stops updating its bindings once inactive).
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(forward.mock.invocationCallOrder[0]);
    expect(profileOf(storage)).toEqual({ ...PROFILE, weight: { kilograms: 80.45 }, updatedAt: NOW.toISOString() });
    expect(storage.values.get(KEY)).toBe(historyBefore);
    expect(page.profileSheetOpen()).toBe(false);
    expect(forward).toHaveBeenCalledWith('/assessment');
  });

  it('the same weight says so and writes nothing', async () => {
    const { open, sheet, sheetTitle, storage, profileBefore, forward } = await renderEntry(ENTRIES, 'a');
    const set = vi.spyOn(storage, 'set');
    await open();
    expect(sheetTitle()).toBe('Already your profile weight');
    expect(clean(byTestId(sheet(), 'profile-weight-same'))).toBe('Your profile weight is already 82.0 kg. Nothing needs to change.');
    expect(byTestId(sheet(), 'confirm-profile-weight')).toBeNull();
    expect(set).not.toHaveBeenCalled();
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(forward).not.toHaveBeenCalled();
  });

  it('a failed save is reported honestly and can be retried; nothing changes meanwhile', async () => {
    const { open, confirm, sheet, page, storage, profileBefore, forward } = await renderEntry(ENTRIES, 'b');
    await open();
    storage.failWrites = true;
    await confirm();
    expect(page.profileSheetOpen()).toBe(true);
    const status = byTestId(sheet(), 'profile-weight-status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(clean(status)).toBe(FAILED);
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(forward).not.toHaveBeenCalled();

    storage.failWrites = false;
    expect(clean(byTestId(sheet(), 'confirm-profile-weight'))).toBe('Try again');
    await confirm();
    expect(profileOf(storage).weight).toEqual({ kilograms: 80.45 });
    expect(forward).toHaveBeenCalledWith('/assessment');
  });

  it('a failure after the sheet was swiped away is shown on the page', async () => {
    const { open, page, fixture, el, storage } = await renderEntry(ENTRIES, 'b');
    await open();
    storage.failWrites = true;
    const pending = page.confirmUseAsProfileWeight();
    page.profileSheetOpen.set(false);
    await pending;
    await settle(fixture);
    expect(clean(byTestId(el, 'form-status'))).toBe(FAILED);
  });

  it('prevents double submission; other actions wait for it', async () => {
    const { open, page, fixture, el, storage } = await renderEntry(ENTRIES, 'b');
    await open();
    const save = vi.spyOn(TestBed.inject(FitnessProfileService), 'save');
    const first = page.confirmUseAsProfileWeight();
    fixture.detectChanges();
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(true);
    expect((byTestId(el, 'delete') as HTMLButtonElement).disabled).toBe(true);
    await page.confirmUseAsProfileWeight();
    await first;
    expect(save).toHaveBeenCalledTimes(1);
    expect(profileOf(storage).weight).toEqual({ kilograms: 80.45 });
  });

  it('an entry deleted meanwhile is reported and nothing changes', async () => {
    const { open, confirm, sheet, storage, profileBefore, forward } = await renderEntry(ENTRIES, 'b');
    await open();
    storage.values.set(KEY, JSON.stringify({ version: 1, entries: [ENTRIES[0]] }));
    await confirm();
    expect(clean(byTestId(sheet(), 'profile-weight-unavailable'))).toBe('This weigh-in may have been deleted, so nothing was changed.');
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(forward).not.toHaveBeenCalled();
  });

  it('a profile read failure is reported in the sheet; the history stays usable', async () => {
    const { open, sheet, el, storage, fixture } = await renderEntry(ENTRIES, 'b');
    const profiles = TestBed.inject(FitnessProfileService);
    vi.spyOn(profiles, 'read').mockRejectedValue(new Error('read'));
    await open();
    expect(clean(byTestId(sheet(), 'profile-weight-unavailable'))).toBe("Your profile couldn't be read, so nothing was changed. Please try again later.");
    fixture.detectChanges();
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(false);
    expect(stored(storage)).toEqual(ENTRIES);
  });

  it('notes that unsaved form changes aren’t used', async () => {
    const { el, fixture, open, sheet, details } = await renderEntry(ENTRIES, 'b');
    const input = byTestId(el, 'field-weight')!.querySelector('input')!;
    input.value = '79';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await open();
    expect(clean(byTestId(sheet(), 'profile-weight-unsaved'))).toContain('this uses the saved weigh-in');
    expect(details()).toContainEqual(['New profile weight', '80.5 kg']);
  });

  it('ordinary add, edit and delete still never touch the profile', async () => {
    const { storage, profileBefore } = await renderEntry(ENTRIES, 'b');
    const service = TestBed.inject(WeightHistoryService);
    const added = await service.add({ weight: 70, unitSystem: 'metric', date: '2026-10-09' });
    expect(added.ok).toBe(true);
    if (added.ok) {
      await service.update(added.entry, { weight: 71, unitSystem: 'metric', date: '2026-10-09' });
      await service.remove(added.entry);
    }
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
  });
});
