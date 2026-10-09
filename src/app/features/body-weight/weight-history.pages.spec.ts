import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { WeightHistoryRepository } from '../../core/body-measurements/weight-history.repository';
import { WEIGHT_ENTRY_ID, WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { WeightEntry } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
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
    expect(clean(button)).toBe('Body weight Your recorded weigh-ins');
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

  it('offers three keyboard-operable ranges, 30 days by default', async () => {
    const { el } = await renderHistory(SPREAD);
    const radios = [...el.querySelectorAll<HTMLInputElement>('fit-segmented-control input[type=radio]')];
    expect(radios.map((r) => [r.value, clean(r.closest('label'))])).toEqual([
      ['30d', '30 days'],
      ['90d', '90 days'],
      ['all', 'All time'],
    ]);
    expect(radios.find((r) => r.checked)?.value).toBe('30d');
    expect(clean(el.querySelector('fit-segmented-control legend'))).toBe('Time range');
  });

  it('switching ranges filters the chart and summary; the full list stays', async () => {
    const { el, fixture } = await renderHistory(SPREAD);
    expect(el.querySelectorAll('[data-testid=weight-chart-point]')).toHaveLength(2);
    expect(summaryText(el)).toBe('First 82.2 kg Thursday, Oct 1 Latest 81.9 kg Today Change −0.3 kg Between first and latest recorded measurements');

    chooseRange(fixture, '90d');
    expect(el.querySelectorAll('[data-testid=weight-chart-point]')).toHaveLength(3);
    expect(clean(byTestId(el, 'trend-change'))).toBe('−1.6 kg');

    chooseRange(fixture, 'all');
    expect(el.querySelectorAll('[data-testid=weight-chart-point]')).toHaveLength(4);
    expect(summaryText(el)).toContain('First 86.0 kg Sunday, Mar 1');
    expect(clean(byTestId(el, 'trend-change'))).toBe('−4.1 kg');

    expect(el.querySelectorAll('[data-testid=weight-row]')).toHaveLength(4);
  });

  it('a range without measurements shows an empty state with Add weight; nothing is invented', async () => {
    const { el, forward } = await renderHistory([entry('old', '2026-03-01', 86)]);
    const empty = byTestId(el, 'trend-empty')!;
    expect(clean(empty)).toContain('No weigh-ins in the last 30 days');
    expect(byTestId(el, 'weight-chart')).toBeNull();
    expect(byTestId(el, 'trend-summary')).toBeNull();
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Add weight')!.click();
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    expect(el.querySelectorAll('[data-testid=weight-row]')).toHaveLength(1);
  });

  it('a single measurement is one visible point and claims no change', async () => {
    const { el } = await renderHistory([entry('only', '2026-10-09', 80)]);
    expect(el.querySelectorAll('[data-testid=weight-chart-point]')).toHaveLength(1);
    expect(byTestId(el, 'weight-chart-line')).toBeNull();
    expect(byTestId(el, 'trend-change')).toBeNull();
    expect(summaryText(el)).toContain('Only one measurement in this range');
  });

  it('keeps every same-day measurement as its own point and text item', async () => {
    const { el } = await renderHistory([
      entry('am', '2026-10-09', 80.2, '2026-10-09T05:00:00.000Z'),
      entry('pm', '2026-10-09', 80.8, '2026-10-09T18:00:00.000Z'),
    ]);
    const points = [...el.querySelectorAll('[data-testid=weight-chart-point]')];
    expect(points).toHaveLength(2);
    expect(points[0].getAttribute('cx')).not.toBe(points[1].getAttribute('cx'));
    expect(measurements(el)).toEqual(['80.2 kg, Today', '80.8 kg, Today']);
  });

  it('describes the chart for screen readers and lists its measurements as text', async () => {
    const { el } = await renderHistory(SPREAD);
    const svg = byTestId(el, 'weight-chart')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(
      'Weight chart for the last 30 days: 2 measurements, from 82.2 kg (Thursday, Oct 1) to 81.9 kg (Today). Change between first and latest recorded measurements: −0.3 kg.',
    );
    expect(byTestId(el, 'trend-measurements')?.getAttribute('aria-label')).toBe('Measurements in this range');
    expect(measurements(el)).toEqual(['82.2 kg, Thursday, Oct 1', '81.9 kg, Today']);
  });

  it('uses the profile’s unit everywhere in the trend', async () => {
    const { el } = await renderHistory([entry('a', '2026-10-01', 80), entry('b', '2026-10-09', 79.5)], { ...PROFILE, unitSystem: 'imperial' });
    expect(summaryText(el)).toBe('First 176.4 lb Thursday, Oct 1 Latest 175.3 lb Today Change −1.1 lb Between first and latest recorded measurements');
    expect(clean(el.querySelector('app-weight-chart .axis-unit'))).toBe('Weight (lb)');
  });

  it('if the chart can’t be built, the summary, text and list remain', async () => {
    vi.spyOn(weightChart, 'build').mockImplementation(() => {
      throw new Error('render');
    });
    const { el } = await renderHistory(SPREAD);
    expect(byTestId(el, 'weight-chart')).toBeNull();
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
    expect(el.querySelectorAll('[data-testid=weight-chart-point]')).toHaveLength(2);
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
    expect(el.querySelectorAll('[data-testid=weight-chart-point]')).toHaveLength(1);
    expect(el.querySelector<HTMLInputElement>('fit-segmented-control input:checked')?.value).toBe('90d');
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
