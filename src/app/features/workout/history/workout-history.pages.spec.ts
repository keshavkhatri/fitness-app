import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { WorkoutLog } from '../../../domain/workout-session';
import { GYM_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { WorkoutHistoryDetailPage } from './workout-history-detail.page';
import { WorkoutHistoryPage } from './workout-history.page';

const local = (month: number, day: number, hour = 9) => new Date(2026, month - 1, day, hour, 0);
const NOW = local(10, 8, 20);

const full = finishedLog({ startedAt: local(10, 8, 18), minutes: 45 });
const partial = finishedLog({ startedAt: local(10, 7, 7), minutes: 38, complete: (e) => e < 4, skipRest: true });
const monday = finishedLog({ startedAt: local(10, 5, 6), minutes: 50 });

function configure(logs: readonly WorkoutLog[]) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: GYM_PROFILE }));
  if (logs.length) {
    storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs }));
  }
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
  };
}

async function renderList(logs: readonly WorkoutLog[], before?: () => void) {
  const spies = configure(logs);
  before?.();
  const fixture = TestBed.createComponent(WorkoutHistoryPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** As read aloud: without aria-hidden parts. */
const spoken = (node: Element | null | undefined) => {
  const copy = node?.cloneNode(true) as Element | undefined;
  copy?.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return clean(copy);
};

describe('Workout History', () => {
  describe('list page', () => {
    it('lists finished workouts newest first, grouped by month, each a named button', async () => {
      const september = finishedLog({ startedAt: local(9, 28), minutes: 40 });
      const { el } = await renderList([monday, full, partial, september]);
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Workout history');
      const months = [...el.querySelectorAll('[data-testid="history-month"]')];
      expect(months.map((m) => [clean(m.querySelector('h2')), clean(m.querySelector('.month-count'))])).toEqual([
        ['October 2026', '3 workouts'],
        ['September 2026', '1 workout'],
      ]);
      const items = [...el.querySelectorAll('[data-testid="history-item"]')];
      expect(items.map((i) => [clean(i.querySelector('.item-meta')), clean(i.querySelector('.item-detail'))])).toEqual([
        ['Thu, 8 Oct · 45 min', '7 exercises'],
        ['Wed, 7 Oct · 38 min', '7 exercises · 13 of 22 sets'],
        ['Mon, 5 Oct · 50 min', '7 exercises'],
        ['Mon, 28 Sep · 40 min', '7 exercises'],
      ]);
      expect(items[1].getAttribute('aria-label')).toBe('Upper Body A, Wednesday, Oct 7, 2026. 38 min, 7 exercises · 13 of 22 sets.');
    });

    it('filters by session type only when the history has more than one', async () => {
      const single = await renderList([full, partial]);
      expect(single.el.querySelector('[data-testid="history-filters"]')).toBeNull();
      TestBed.resetTestingModule();

      const plan = planFor();
      const lowerId = plan.sessions.find((x) => x.kind === 'resistance' && x.sessionType === 'lower')!.id;
      const lower = finishedLog({ plan, sessionId: lowerId, startedAt: local(10, 6, 18), minutes: 46 });
      const { el, fixture } = await renderList([full, lower, monday]);
      const filters = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="history-filters"] button')];
      expect(filters.map((f) => [clean(f), f.getAttribute('aria-pressed')])).toEqual([
        ['All', 'true'],
        ['Upper Body', 'false'],
        ['Lower Body', 'false'],
      ]);
      filters[2].click();
      fixture.detectChanges();
      expect([...el.querySelectorAll('[data-testid="history-item"] .item-title')].map((t) => clean(t))).toEqual(['Lower Body A']);
      expect(clean(el.querySelector('.month-count'))).toBe('1 workout');
      expect(filters[2].getAttribute('aria-pressed')).toBe('true');
    });

    it('opens a workout’s history detail', async () => {
      const { el, forward, fixture } = await renderList([full, partial]);
      (el.querySelectorAll('[data-testid="history-item"]')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'history', partial.id]);
    });

    it('empty history is an invitation, not an error', async () => {
      const { el, back, fixture } = await renderList([]);
      expect(clean(el.querySelector('[data-testid="history-empty"]'))).toContain('No completed workouts yet');
      expect(clean(el.querySelector('[data-testid="history-empty"]'))).toContain('Complete your first workout and your history will appear here.');
      expect(el.querySelector('[data-testid="history-error"]')).toBeNull();
      [...el.querySelectorAll('button')].find((b) => clean(b) === 'View Workout')!.click();
      await fixture.whenStable();
      expect(back).toHaveBeenCalledWith('/workout');
    });

    it('a storage failure shows a friendly error with retry', async () => {
      let fail = true;
      const { el, fixture } = await renderList([full], () => {
        const service = TestBed.inject(WorkoutHistoryService);
        const list = service.list.bind(service);
        vi.spyOn(service, 'list').mockImplementation(() => (fail ? Promise.resolve({ ok: false as const }) : list()));
      });
      expect(clean(el.querySelector('[data-testid="history-error"]'))).toContain("Couldn't load workout history");
      expect(el.textContent).not.toMatch(/Error|storage|disk/);
      fail = false;
      [...el.querySelectorAll('button')].find((b) => clean(b) === 'Try Again')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid="history-item"]')).toHaveLength(1);
    });

    it('loading uses skeletons and announces itself', () => {
      configure([full]);
      vi.spyOn(TestBed.inject(WorkoutHistoryService), 'list').mockReturnValue(new Promise(() => undefined));
      const fixture = TestBed.createComponent(WorkoutHistoryPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="history-loading"]')?.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelector('[data-testid="announcement"]')?.textContent?.trim()).toBe('Loading workout history');
    });

    it('every item is a named button; headings are h1 then month h2s', async () => {
      const { el } = await renderList([full, partial, finishedLog({ startedAt: local(9, 28), minutes: 40 })]);
      const headings = [...el.querySelectorAll('h1, h2, h3')].map((h) => h.tagName);
      expect(headings).toEqual(['H1', 'H2', 'H2']);
      for (const b of el.querySelectorAll('button')) {
        expect(clean(b) || b.getAttribute('aria-label')).not.toBe('');
        expect(b.getAttribute('type')).toBe('button');
      }
    });
  });

  describe('historical detail page', () => {
    async function renderDetail(id: string, logs: readonly WorkoutLog[]) {
      const spies = configure(logs);
      const fixture = TestBed.createComponent(WorkoutHistoryDetailPage);
      fixture.componentRef.setInput('workoutId', id);
      await fixture.whenStable();
      fixture.detectChanges();
      return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('shows the record: date, duration, status, totals and every set as done', async () => {
      const { el, storage } = await renderDetail(partial.id, [full, partial]);
      const before = storage.values.get('fitness.workout-logs');
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Upper Body A');
      expect(spoken(el.querySelector('[data-testid="completed-label"]'))).toBe('Completed: Yesterday · 7:38 AM. Duration: 38 min');
      expect(clean(el.querySelector('[data-testid="completed-label"]'))).toContain('Wed, 7 Oct 2026•38 min');
      expect(clean(el.querySelector('[data-testid="detail-status"]'))).toBe('Finished · 13/22 sets');
      expect([...el.querySelectorAll('[data-testid="history-metrics"] .metric')].map((m) => [clean(m.querySelector('dt')), clean(m.querySelector('dd'))])).toEqual([
        ['Exercises', '4/7'],
        ['Sets done', '13'],
        ['Volume (kg)', '4,070'],
      ]);

      const bench = el.querySelectorAll('[data-testid="history-exercise"]')[0];
      expect(clean(bench.querySelector('h3'))).toBe('Bench Press');
      expect(spoken(bench.querySelector('.count'))).toBe('4 sets, All sets done');
      expect(clean(bench.querySelector('[data-testid="history-best"]'))).toBe('Max: 42.5 kg × 9');
      const actual = bench.querySelector('[data-testid="actual-sets"]')!;
      expect(actual.getAttribute('aria-label')).toBe('Bench Press, actual sets');
      expect([...actual.querySelectorAll('li')].map((li) => spoken(li))).toEqual([
        'Set 1: 40 kg × 10',
        'Set 2: 42.5 kg × 9',
        'Set 3: 42.5 kg × 8',
        'Set 4: 42.5 kg × 7',
      ]);

      const skippedExercise = el.querySelectorAll('[data-testid="history-exercise"]')[4];
      expect([...skippedExercise.querySelectorAll('[data-testid="actual-sets"] li')].map((li) => li.getAttribute('data-status'))).toEqual([
        'skipped',
        'skipped',
        'skipped',
      ]);
      expect(spoken(skippedExercise.querySelector('[data-testid="actual-sets"] li'))).toBe('Set 1: Skipped');
      expect(skippedExercise.querySelector('[data-testid="history-best"]')).toBeNull();
      // Viewing never changes the record.
      expect(storage.values.get('fitness.workout-logs')).toBe(before);
    });

    it('Summary shows the totals and what was planned at the time, separately from the sets', async () => {
      const { el, fixture } = await renderDetail(partial.id, [partial]);
      expect(el.querySelector('[data-testid="history-summary"]')).toBeNull();
      const summary = [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.value === 'summary')!;
      summary.click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="history-exercise"]')).toBeNull();
      const facts = [...el.querySelectorAll('[data-testid="history-summary"] .fact')].map((f) => [clean(f.querySelector('dt')), clean(f.querySelector('dd'))]);
      expect(facts).toContainEqual(['Sets skipped', '9']);
      expect(clean(el.querySelector('[data-testid="planned"]'))).toBe('4 sets · 6–10 reps · 120 sec rest');
    });

    it('is rendered from the stored log (not today’s plan): a renamed exercise keeps its recorded name', async () => {
      const renamed: WorkoutLog = { ...full, exercises: full.exercises.map((e, i) => (i === 0 ? { ...e, name: 'Old Bench Name' } : e)) };
      const { el } = await renderDetail(full.id, [renamed]);
      expect(clean(el.querySelector('[data-testid="history-exercise"] h3'))).toBe('Old Bench Name');
    });

    it('unknown workout: calm not-found state with a way back to history', async () => {
      const { el, back, fixture } = await renderDetail('wl-missing', [full]);
      expect(clean(el.querySelector('[data-testid="history-detail-not-found"]'))).toContain('Workout not found');
      expect(el.querySelectorAll('h1')).toHaveLength(1);
      [...el.querySelectorAll('button')].find((b) => clean(b) === 'Back to History')!.click();
      await fixture.whenStable();
      expect(back).toHaveBeenCalledWith('/workout/history');
    });

    it('heading hierarchy: h1 workout, h2 for the view, h3 per exercise', async () => {
      const { el } = await renderDetail(full.id, [full]);
      const headings = [...el.querySelectorAll('h1, h2, h3')].map((h) => h.tagName);
      expect(headings.slice(0, 3)).toEqual(['H1', 'H2', 'H3']);
      expect(headings.filter((h) => h === 'H3')).toHaveLength(7);
    });
  });
});
