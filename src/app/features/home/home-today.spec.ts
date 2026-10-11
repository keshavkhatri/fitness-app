import { DaySummaryView } from '../nutrition/nutrition-view-model';
import { toBodyTile, toFuelTile, toHomeToday } from './home-today';
import { HomeWorkoutView } from './home-training';

const resistance = (setsTotal: number | null = 22): HomeWorkoutView => ({
  kind: 'resistance',
  sessionId: 'day-1-upper',
  title: 'Upper Body A',
  descriptor: 'Strength',
  countLabel: '7 exercises',
  durationLabel: 'About 45 min',
  exercises: [],
  focusAreas: ['Chest', 'Back'],
  setsTotal,
});
const resume = (setsDone: number, setsTotal: number): HomeWorkoutView => ({
  kind: 'resume',
  sessionId: 'day-1-upper',
  title: 'Upper Body A',
  progress: `${setsDone} of ${setsTotal} sets done`,
  setsDone,
  setsTotal,
});

describe('Home "Your day"', () => {
  describe('ring and Train tile', () => {
    it('a planned workout: 0 of its planned sets (a real count, not an estimate)', () => {
      const view = toHomeToday(resistance(22), false);
      expect(view.ring).toEqual({ kind: 'progress', value: 0, max: 22, label: '0%', caption: 'sets', valueText: '0 of 22 sets done' });
      expect(view.train).toMatchObject({ value: '0/22', unit: 'sets', action: { kind: 'open-session', sessionId: 'day-1-upper' } });
    });

    it('a workout in progress: its sets done, rounded percentage, Train resumes it', () => {
      const view = toHomeToday(resume(8, 22), false);
      expect(view.ring).toMatchObject({ kind: 'progress', value: 8, max: 22, label: '36%', valueText: '8 of 22 sets done' });
      expect(view.train).toMatchObject({ value: '8/22', progress: { value: 8, max: 22 }, action: { kind: 'resume', sessionId: 'day-1-upper' } });
      expect(view.status).toBe('Pick up where you left off.');
    });

    it('in progress wins over a workout already finished today', () => {
      expect(toHomeToday(resume(3, 10), true).train.action.kind).toBe('resume');
    });

    it('finished today: done, whatever today’s plan says', () => {
      for (const workout of [resistance(), { kind: 'rest', message: '', upNext: null } as const]) {
        const view = toHomeToday(workout, true);
        expect(view.ring).toMatchObject({ kind: 'progress', value: 1, max: 1, label: '100%', caption: 'done' });
        expect(view.train.value).toBe('Done');
      }
    });

    it('unknown history (null) is not treated as done', () => {
      expect(toHomeToday(resistance(), null).train.value).toBe('0/22');
    });

    it('no set count available: a state, never a made-up percentage', () => {
      expect(toHomeToday(resistance(null), false).ring).toEqual({ kind: 'state', icon: 'barbell', label: 'Today' });
      expect(toHomeToday(resistance(null), false).train.progress).toBeNull();
    });

    it('activity, rest, no profile and an unavailable plan show states with their own actions', () => {
      const activity = toHomeToday({ kind: 'activity', sessionId: 'day-3-activity', title: 'Light Activity', summary: '' }, false);
      expect(activity.ring.kind).toBe('state');
      expect(activity.train.action).toEqual({ kind: 'open-session', sessionId: 'day-3-activity' });

      const rest = toHomeToday({ kind: 'rest', message: '', upNext: null }, false);
      expect(rest.ring).toEqual({ kind: 'state', icon: 'moon-outline', label: 'Rest' });
      expect(rest.train.action).toEqual({ kind: 'workout-tab' });

      expect(toHomeToday({ kind: 'no-profile' }, null).train.action).toEqual({ kind: 'set-up-profile' });
      expect(toHomeToday({ kind: 'unavailable' }, null).train.action).toEqual({ kind: 'workout-tab' });
    });
  });

  describe('Fuel tile', () => {
    const summary = (calories: Partial<DaySummaryView['calories']>): DaySummaryView => ({
      calories: { headline: '', eaten: '0', target: null, status: null, balance: null, over: false, progress: null, ...calories },
      macros: [],
      targetNote: null,
    });

    it('calories against the target, with a bar', () => {
      const tile = toFuelTile(
        summary({ eaten: '1,420', target: '2,000', progress: { value: 1420, max: 2000, valueText: '1,420 of 2,000 kcal, 580 kcal remaining' } }),
      );
      expect(tile).toMatchObject({ value: '1,420', unit: '/ 2,000 kcal', progress: { value: 1420, max: 2000, tone: 'primary' }, note: null });
      expect(tile.accessibleLabel).toBe('Fuel: 1,420 of 2,000 kcal, 580 kcal remaining. Open nutrition.');
    });

    it('over target: a warning bar and the words "Over target"', () => {
      const tile = toFuelTile(summary({ eaten: '2,300', target: '2,000', over: true, progress: { value: 2300, max: 2000, valueText: 'x' } }));
      expect(tile.progress?.tone).toBe('warning');
      expect(tile.note).toBe('Over target');
    });

    it('no target: intake only, no bar', () => {
      const tile = toFuelTile(summary({ eaten: '230', headline: '230 kcal eaten' }));
      expect(tile).toMatchObject({ value: '230', unit: 'kcal', progress: null });
    });

    it('a failed read offers a retry', () => {
      expect(toFuelTile('error')).toMatchObject({ value: '—', action: { kind: 'retry-nutrition' } });
    });
  });

  describe('Body tile', () => {
    it('the latest weigh-in with its change; no bar (there is no target)', () => {
      const tile = toBodyTile({ kind: 'ready', value: '78.4', unit: 'kg', dateLabel: 'Yesterday', change: '−1.2 kg · 30 days', points: [], accessibleLabel: 'Body weight …' });
      expect(tile).toMatchObject({ value: '78.4', unit: 'kg', note: '−1.2 kg · 30 days', progress: null, action: { kind: 'weight-history' } });
    });

    it('a single weigh-in shows its date instead of a change', () => {
      const tile = toBodyTile({ kind: 'ready', value: '78.4', unit: 'kg', dateLabel: 'Today', change: null, points: [], accessibleLabel: '' });
      expect(tile.note).toBe('Today');
    });

    it('no weigh-ins: log one; a failed read: retry', () => {
      expect(toBodyTile({ kind: 'empty' }).action).toEqual({ kind: 'log-weight' });
      expect(toBodyTile({ kind: 'error' }).action).toEqual({ kind: 'retry-weight' });
    });
  });
});
