import { EXERCISE_LIBRARY } from './exercise-library';
import { Exercise } from './exercise.model';
import { VolumeItem, balanceWeeklyVolume, volumeGroupsOf, volumeStatus, volumeTargets, weeklySets } from './weekly-volume';
import { DEFAULT_WORKOUT_CONFIG as CONFIG, NumberRange } from './workout-config';
import { ObjectiveRole, VOLUME_GROUPS, VolumeGroup } from './workout-taxonomy';

const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));
const ex = (id: string) => byId.get(id) as Exercise;
const item = (id: string, sets: number, role: ObjectiveRole = 'accessory'): VolumeItem => ({ exercise: ex(id), role, sets });

const open = (): Record<VolumeGroup, NumberRange> =>
  Object.fromEntries(VOLUME_GROUPS.map((g) => [g, { min: 0, max: 30 }])) as Record<VolumeGroup, NumberRange>;

describe('weekly volume', () => {
  it('maps primary muscles to volume groups', () => {
    expect(volumeGroupsOf(ex('barbell-bench-press'))).toEqual(['chest']);
    expect(volumeGroupsOf(ex('romanian-deadlift')).sort()).toEqual(['glutes', 'hamstrings']);
    expect(volumeGroupsOf(ex('seated-cable-row'))).toEqual(['back']); // upper-back + lats → one group
  });

  it('counts direct sets only, never core or conditioning work', () => {
    const totals = weeklySets([item('barbell-bench-press', 4, 'primary'), item('push-up', 3, 'secondary'), item('plank', 3, 'core')]);
    expect(totals.chest).toBe(7);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('scales minimums (not maximums) down for fewer sessions than the reference week', () => {
    const four = volumeTargets('hypertrophy', 'intermediate', 4, 'full-body', CONFIG);
    const two = volumeTargets('hypertrophy', 'intermediate', 2, 'full-body', CONFIG);
    const six = volumeTargets('hypertrophy', 'intermediate', 6, 'push-pull-legs', CONFIG);
    expect(four.chest).toEqual(CONFIG.weeklyVolume.targets.hypertrophy.intermediate.chest);
    expect(two.chest).toEqual({ min: Math.round(four.chest.min / 2), max: four.chest.max });
    expect(six.chest).toEqual(four.chest);
  });

  describe('rear-delt direct minimum (conditional)', () => {
    const rear = (style: 'hypertrophy' | 'strength' | 'general', experience: 'beginner' | 'intermediate' | 'advanced', sessions: number, strategy: Parameters<typeof volumeTargets>[3]) =>
      volumeTargets(style, experience, sessions, strategy, CONFIG)['rear-delts'];

    it('is a small configurable minimum (2–4 sets) for intermediate/advanced hypertrophy', () => {
      expect(rear('hypertrophy', 'intermediate', 6, 'push-pull-legs').min).toBe(2);
      expect(rear('hypertrophy', 'advanced', 6, 'push-pull-legs').min).toBe(3);
      expect(rear('hypertrophy', 'advanced', 3, 'full-body').min).toBe(2); // scaled for fewer sessions
      for (const experience of ['intermediate', 'advanced'] as const) {
        const min = CONFIG.weeklyVolume.targets.hypertrophy[experience]['rear-delts'].min;
        expect(min).toBeGreaterThanOrEqual(2);
        expect(min).toBeLessThanOrEqual(4);
      }
    });

    it('does not apply to beginners, strength or general programs', () => {
      expect(rear('hypertrophy', 'beginner', 3, 'full-body').min).toBe(0);
      expect(rear('strength', 'advanced', 6, 'push-pull-legs').min).toBe(0);
      expect(rear('general', 'advanced', 6, 'push-pull-legs').min).toBe(0);
    });

    it('is disabled where the week has no room for it (two sessions, upper/lower) but keeps its maximum', () => {
      expect(rear('hypertrophy', 'advanced', 2, 'full-body')).toEqual({ min: 0, max: 12 });
      expect(rear('hypertrophy', 'advanced', 4, 'upper-lower')).toEqual({ min: 0, max: 12 });
    });

    it('follows the configuration', () => {
      const config = {
        ...CONFIG,
        weeklyVolume: { ...CONFIG.weeklyVolume, conditionalMinimums: {} },
      };
      expect(volumeTargets('hypertrophy', 'advanced', 4, 'upper-lower', config)['rear-delts'].min).toBe(3);
    });

    it('only rear-delt exercises count: rows stay back work', () => {
      expect(volumeGroupsOf(ex('seated-cable-row'))).not.toContain('rear-delts');
      expect(volumeGroupsOf(ex('rear-delt-fly'))).toEqual(['rear-delts']);
    });
  });

  it('reports status against a range', () => {
    expect(volumeStatus(3, { min: 4, max: 10 })).toBe('below');
    expect(volumeStatus(4, { min: 4, max: 10 })).toBe('within');
    expect(volumeStatus(11, { min: 4, max: 10 })).toBe('above');
  });

  describe('balancing (redistribution, not more exercises)', () => {
    it('adds sets to an under-target group, fewest-set exercise first', () => {
      const items = [item('barbell-bench-press', 3, 'primary'), item('dumbbell-bench-press', 2, 'secondary')];
      const targets = { ...open(), chest: { min: 7, max: 12 } };
      const adjustments = balanceWeeklyVolume(items, targets, 'intermediate', CONFIG);
      expect(items.map((i) => i.sets)).toEqual([4, 3]);
      expect(adjustments.map((a) => [a.item.exercise.id, a.delta, a.group])).toEqual([
        ['dumbbell-bench-press', 1, 'chest'],
        ['barbell-bench-press', 1, 'chest'],
      ]);
    });

    it('removes sets from an over-target group, accessories first, never from primary lifts', () => {
      const items = [item('back-squat', 4, 'primary'), item('leg-press', 3, 'secondary'), item('leg-extension', 3)];
      const targets = { ...open(), quads: { min: 0, max: 8 } };
      balanceWeeklyVolume(items, targets, 'intermediate', CONFIG);
      expect(items.map((i) => i.sets)).toEqual([4, 2, 2]);
    });

    it('never goes below the per-exercise minimum or above the per-exercise maximum', () => {
      const low = [item('leg-extension', 2)];
      balanceWeeklyVolume(low, { ...open(), quads: { min: 0, max: 0 } }, 'beginner', CONFIG);
      expect(low[0].sets).toBe(CONFIG.weeklyVolume.minSetsPerExercise);
      const high = [item('leg-extension', 3)];
      balanceWeeklyVolume(high, { ...open(), quads: { min: 20, max: 30 } }, 'beginner', CONFIG);
      expect(high[0].sets).toBe(CONFIG.weeklyVolume.maxSetsPerExercise.beginner);
    });

    it('does not push another group over its maximum while fixing a deficit', () => {
      const items = [item('romanian-deadlift', 3, 'secondary')]; // hamstrings + glutes
      balanceWeeklyVolume(items, { ...open(), hamstrings: { min: 6, max: 10 }, glutes: { min: 0, max: 3 } }, 'advanced', CONFIG);
      expect(items[0].sets).toBe(3);
    });

    it('respects a caller veto (e.g. the session would become too long)', () => {
      const items = [item('barbell-bench-press', 3, 'primary')];
      expect(balanceWeeklyVolume(items, { ...open(), chest: { min: 6, max: 12 } }, 'advanced', CONFIG, () => false)).toEqual([]);
      expect(items[0].sets).toBe(3);
    });

    it('is bounded by maxAdjustments', () => {
      const items = [item('leg-extension', 2), item('leg-press', 2, 'secondary')];
      const config = { ...CONFIG, weeklyVolume: { ...CONFIG.weeklyVolume, maxAdjustments: 1 } };
      expect(balanceWeeklyVolume(items, { ...open(), quads: { min: 30, max: 30 } }, 'advanced', config)).toHaveLength(1);
    });
  });
});
