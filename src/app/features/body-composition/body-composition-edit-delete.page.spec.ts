import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { BodyCompositionAssessment } from '../../domain/body-composition';
import { BodyCompositionDetailPage } from './body-composition-detail.page';
import { BodyCompositionEntryPage } from './body-composition-entry.page';

const KEY = 'fitness.body-composition-assessments';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const PROFILE_KEY = 'fitness.profile';
/** Friday 9 October 2026, 08:00 local. */
const NOW = new Date(2026, 9, 9, 8, 0);
const WEIGHTS = JSON.stringify({ version: 1, entries: [{ id: 'w', date: '2026-10-01', weight: { kilograms: 82 } }] });
const PROFILE = JSON.stringify({ version: 2, profile: { unitSystem: 'metric' } });
const IMPORTED: BodyCompositionAssessment = {
  id: 'imported',
  date: '2026-10-01',
  source: { device: 'inbody', entryMethod: 'import', format: 'inbody-570-result-sheet', parser: { name: 'inbody-pdf', version: '0.1.0' } },
  reported: {
    weight: { value: 81.37, unit: 'kg' },
    'fat-free-mass': { value: 63.1, unit: 'kg' },
    'lean-body-mass': { value: 60.2, unit: 'kg' },
    'phase-angle': { value: 6.1, unit: '°' },
  },
  createdAt: '2026-10-01T06:00:00.000Z',
  updatedAt: '2026-10-01T06:00:00.000Z',
};
const MANUAL: BodyCompositionAssessment = {
  id: 'manual',
  date: '2026-10-05',
  source: { device: 'inbody', entryMethod: 'manual' },
  reported: { 'body-fat-percentage': { value: 22.4, unit: '%' } },
  createdAt: '2026-10-05T06:00:00.000Z',
  updatedAt: '2026-10-05T06:00:00.000Z',
};
const envelope = (assessments: BodyCompositionAssessment[]) => JSON.stringify({ version: 1, assessments });

function configure(assessments: BodyCompositionAssessment[]) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set(KEY, envelope(assessments));
  storage.values.set(WEIGHT_KEY, WEIGHTS);
  storage.values.set(PROFILE_KEY, PROFILE);
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
  };
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const byTestId = (root: Element, id: string) => root.querySelector(`[data-testid="${id}"]`);
const stored = (storage: MemoryKeyValueStorage): BodyCompositionAssessment[] => JSON.parse(storage.values.get(KEY)!).assessments;

async function render<T>(component: Type<T>, id: string, assessments: BodyCompositionAssessment[]) {
  const spies = configure(assessments);
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('assessmentId', id);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  // Bottom sheets render outside the component.
  const doc = document.body;
  const click = async (root: Element, testId: string) => {
    (byTestId(root, testId) as HTMLButtonElement).click();
    await settle(fixture);
  };
  return { ...spies, fixture, el, doc, click };
}

describe('Editing a body composition assessment', () => {
  it('prefills every saved value, keeping fat-free and lean body mass apart, and hides report upload', async () => {
    const { el } = await render(BodyCompositionEntryPage, 'imported', [IMPORTED]);
    const value = (field: string) => byTestId(el, `field-${field}`)!.querySelector('input')!.value;
    expect(value('weight')).toBe('81.37');
    expect(value('fat-free-mass')).toBe('63.1');
    expect(value('lean-body-mass')).toBe('60.2');
    expect(value('phase-angle')).toBe('6.1');
    expect(value('date')).toBe('2026-10-01');
    expect(byTestId(el, 'report-upload')).toBeNull();
    expect(byTestId(el, 'imported-note')).not.toBeNull();
    expect(byTestId(el, 'save')!.textContent).toContain('Save changes');
  });

  it('saves a correction as a manual entry, keeping id, creation time, date, weigh-ins and profile', async () => {
    const { el, fixture, storage, back } = await render(BodyCompositionEntryPage, 'imported', [IMPORTED, MANUAL]);
    const input = byTestId(el, 'field-lean-body-mass')!.querySelector('input')!;
    input.value = '60.5';
    input.dispatchEvent(new Event('input'));
    byTestId(el, 'body-composition-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    const saved = stored(storage).find((a) => a.id === 'imported')!;
    expect(saved).toEqual({
      ...IMPORTED,
      source: { device: 'inbody', entryMethod: 'manual' },
      reported: { ...IMPORTED.reported, 'lean-body-mass': { value: 60.5, unit: 'kg' } },
      updatedAt: NOW.toISOString(),
    });
    expect(stored(storage).find((a) => a.id === 'manual')).toEqual(MANUAL);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    expect(storage.values.get(PROFILE_KEY)).toBe(PROFILE);
    expect(back).toHaveBeenCalledWith(['/you', 'body-composition', 'imported']);
  });

  it('keeps the import provenance when only the date changes', async () => {
    const { el, fixture, storage } = await render(BodyCompositionEntryPage, 'imported', [IMPORTED]);
    const date = byTestId(el, 'field-date')!.querySelector('input')!;
    date.value = '2026-09-30';
    date.dispatchEvent(new Event('input'));
    byTestId(el, 'body-composition-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(stored(storage)[0]).toEqual({ ...IMPORTED, date: '2026-09-30', updatedAt: NOW.toISOString() });
  });

  it('shows not found for an unknown assessment', async () => {
    const { el } = await render(BodyCompositionEntryPage, 'missing', [MANUAL]);
    expect(byTestId(el, 'not-found')).not.toBeNull();
  });
});

describe('Deleting a body composition assessment', () => {
  afterEach(() => document.querySelectorAll('fit-bottom-sheet, ion-modal').forEach((n) => n.remove()));

  it('opens Edit from the detail page', async () => {
    const { el, click, forward } = await render(BodyCompositionDetailPage, 'manual', [MANUAL]);
    await click(el, 'edit');
    expect(forward).toHaveBeenCalledWith(['/you', 'body-composition', 'manual', 'edit']);
  });

  it('styles the destructive action red and the cancel neutral', async () => {
    const { el, doc, click } = await render(BodyCompositionDetailPage, 'manual', [MANUAL]);
    expect(byTestId(el, 'delete')?.getAttribute('data-variant')).toBe('ghost-danger');
    await click(el, 'delete');
    expect(byTestId(doc, 'confirm-delete')?.getAttribute('data-variant')).toBe('danger');
    expect(byTestId(doc, 'cancel-delete')?.getAttribute('data-variant')).toBe('outline');
  });

  it('cancel leaves the assessment unchanged', async () => {
    const { el, doc, click, storage, back } = await render(BodyCompositionDetailPage, 'manual', [IMPORTED, MANUAL]);
    const before = storage.values.get(KEY);
    await click(el, 'delete');
    expect(byTestId(doc, 'delete-confirm')).not.toBeNull();
    await click(doc, 'cancel-delete');
    expect(storage.values.get(KEY)).toBe(before);
    expect(back).not.toHaveBeenCalled();
  });

  it('confirming removes only that assessment, keeps weigh-ins and profile, and returns to the history', async () => {
    const { el, doc, click, storage, back } = await render(BodyCompositionDetailPage, 'manual', [IMPORTED, MANUAL]);
    await click(el, 'delete');
    await click(doc, 'confirm-delete');
    expect(stored(storage)).toEqual([IMPORTED]);
    expect(storage.values.get(WEIGHT_KEY)).toBe(WEIGHTS);
    expect(storage.values.get(PROFILE_KEY)).toBe(PROFILE);
    expect(back).toHaveBeenCalledWith('/you/body-composition');
  });

  it('deleting the last assessment leaves an empty history', async () => {
    const { el, doc, click, storage } = await render(BodyCompositionDetailPage, 'manual', [MANUAL]);
    await click(el, 'delete');
    await click(doc, 'confirm-delete');
    expect(stored(storage)).toEqual([]);
  });
});
