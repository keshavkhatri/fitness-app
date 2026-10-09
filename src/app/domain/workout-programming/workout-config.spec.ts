import { isObjectiveRequired } from './session-templates';
import { DEFAULT_WORKOUT_CONFIG as DEFAULTS, WorkoutProgrammingConfig, validateWorkoutConfig } from './workout-config';
import { PrescriptionProfile, ProgramStyle } from './workout-taxonomy';

const withPrescription = (style: ProgramStyle, profile: PrescriptionProfile, patch: object): WorkoutProgrammingConfig => ({
  ...DEFAULTS,
  prescriptions: {
    ...DEFAULTS.prescriptions,
    [style]: { ...DEFAULTS.prescriptions[style], [profile]: { ...DEFAULTS.prescriptions[style][profile], ...patch } },
  },
});

const withSelection = (patch: Partial<WorkoutProgrammingConfig['selection']>): WorkoutProgrammingConfig => ({
  ...DEFAULTS,
  selection: { ...DEFAULTS.selection, ...patch },
});

const withWeeklyVolume = (patch: Partial<WorkoutProgrammingConfig['weeklyVolume']>): WorkoutProgrammingConfig => ({
  ...DEFAULTS,
  weeklyVolume: { ...DEFAULTS.weeklyVolume, ...patch },
});

describe('workout programming configuration', () => {
  it('accepts the defaults', () => {
    expect(validateWorkoutConfig(DEFAULTS)).toEqual([]);
  });

  it('keeps default volumes inside the outer limits', () => {
    expect(Object.values(DEFAULTS.volume.exercisesPerSession).every((n) => n >= 3 && n <= 10)).toBe(true);
  });

  describe('prescription profiles (defaults)', () => {
    it('low-load work gets more reps and less rest than loaded compounds', () => {
      for (const style of ['hypertrophy', 'strength', 'general'] as const) {
        const low = DEFAULTS.prescriptions[style]['low-load'];
        const primary = DEFAULTS.prescriptions[style]['primary-compound'];
        expect(low.reps.max).toBeGreaterThan(primary.reps.max);
        expect(low.restSeconds).toBeLessThan(primary.restSeconds);
      }
    });

    it('strength primaries are heavy with long rest; accessories are not', () => {
      const s = DEFAULTS.prescriptions.strength;
      expect(s['primary-compound'].reps).toEqual({ min: 4, max: 6 });
      expect(s['primary-compound'].restSeconds).toBeGreaterThanOrEqual(180);
      expect(s['unilateral-compound'].reps.min).toBeGreaterThanOrEqual(8); // no heavy single-leg work
      expect(s.accessory.restSeconds).toBeLessThan(s['secondary-compound'].restSeconds);
    });
  });

  describe('session templates', () => {
    it('required objectives fit every experience/goal budget', () => {
      for (const experience of ['beginner', 'intermediate', 'advanced'] as const) {
        for (const goal of ['lose-fat', 'build-muscle', 'get-stronger', 'recomposition', 'improve-fitness'] as const) {
          const budget = DEFAULTS.volume.exercisesPerSession[experience] + DEFAULTS.volume.goalAdjustment[goal];
          for (const t of DEFAULTS.templates) {
            const style = DEFAULTS.programStyleByGoal[goal];
            expect(t.objectives.filter((o) => isObjectiveRequired(o, style, experience)).length).toBeLessThanOrEqual(budget);
          }
        }
      }
    });

    it('upper sessions require arm and shoulder work for intermediate+ hypertrophy only', () => {
      const upper = DEFAULTS.templates.find((t) => t.id === 'upper')!;
      const arms = upper.objectives.filter((o) => ['elbow-flexion', 'elbow-extension', 'shoulder-isolation'].includes(o.id));
      expect(arms).toHaveLength(3);
      for (const o of arms) {
        expect(isObjectiveRequired(o, 'hypertrophy', 'intermediate')).toBe(true);
        expect(isObjectiveRequired(o, 'hypertrophy', 'beginner')).toBe(false);
        expect(isObjectiveRequired(o, 'strength', 'advanced')).toBe(false);
      }
    });

    it('only full-body pull objectives accept scapular substitutes', () => {
      for (const t of DEFAULTS.templates) {
        for (const o of t.objectives.filter((o) => o.patterns.some((p) => p.endsWith('-pull')))) {
          expect(!!o.substituteClasses?.includes('scapular'), `${t.id}/${o.id}`).toBe(t.sessionType === 'full-body');
        }
      }
    });
  });

  it.each<[string, WorkoutProgrammingConfig]>([
    ['unknown version', { ...DEFAULTS, version: 'v0' as never }],
    ['500 exercises per session', { ...DEFAULTS, volume: { ...DEFAULTS.volume, exercisesPerSession: { ...DEFAULTS.volume.exercisesPerSession, advanced: 500 } } }],
    ['budget below required objectives', { ...DEFAULTS, volume: { ...DEFAULTS.volume, goalAdjustment: { ...DEFAULTS.volume.goalAdjustment, 'build-muscle': -3 } } }],
    ['minimum above budget limits', { ...DEFAULTS, volume: { ...DEFAULTS.volume, minimumExercisesPerSession: 9 } }],
    ['50 sets per exercise', withPrescription('hypertrophy', 'primary-compound', { sets: { beginner: 3, intermediate: 50, advanced: 4 } })],
    ['zero sets', withPrescription('general', 'accessory', { sets: { beginner: 0, intermediate: 2, advanced: 3 } })],
    ['inverted rep range', withPrescription('hypertrophy', 'secondary-compound', { reps: { min: 12, max: 8 } })],
    ['100-rep sets', withPrescription('general', 'low-load', { reps: { min: 10, max: 100 } })],
    ['zero rest', withPrescription('hypertrophy', 'accessory', { restSeconds: 0 })],
    ['short rest on strength compounds', withPrescription('strength', 'primary-compound', { restSeconds: 60 })],
    ['absurd timed interval', withPrescription('general', 'conditioning', { timeSeconds: 900 })],
    ['missing prescription profile', { ...DEFAULTS, prescriptions: { ...DEFAULTS.prescriptions, general: { ...DEFAULTS.prescriptions.general, 'low-load': undefined as never } } }],
    ['split with wrong session count', { ...DEFAULTS, splits: { ...DEFAULTS.splits, byFrequency: { ...DEFAULTS.splits.byFrequency, 4: { strategy: 'upper-lower', sessions: ['upper', 'lower'] } } } }],
    ['split with unknown session type', { ...DEFAULTS, splits: { ...DEFAULTS.splits, byFrequency: { ...DEFAULTS.splits.byFrequency, 2: { strategy: 'full-body', sessions: ['full-body', 'arms' as never] } } } }],
    ['split with only activity days', { ...DEFAULTS, splits: { ...DEFAULTS.splits, byFrequency: { ...DEFAULTS.splits.byFrequency, 2: { strategy: 'full-body', sessions: ['light-activity', 'light-activity'] } } } }],
    ['experience override with wrong length', { ...DEFAULTS, splits: { ...DEFAULTS.splits, experienceOverrides: { beginner: { 6: { strategy: 'full-body-with-recovery', sessions: ['full-body', 'light-activity'] } } } } }],
    ['activity day with inverted duration', { ...DEFAULTS, activityDays: { ...DEFAULTS.activityDays, 'light-activity': { ...DEFAULTS.activityDays['light-activity'], durationMinutes: { min: 40, max: 20 } } } }],
    ['activity day of three hours', { ...DEFAULTS, activityDays: { ...DEFAULTS.activityDays, 'optional-conditioning': { ...DEFAULTS.activityDays['optional-conditioning'], durationMinutes: { min: 15, max: 180 } } } }],
    ['activity day without suggestions', { ...DEFAULTS, activityDays: { ...DEFAULTS.activityDays, 'light-activity': { ...DEFAULTS.activityDays['light-activity'], suggestedActivities: [] } } }],
    ['unknown infeasible fallback', { ...DEFAULTS, splits: { ...DEFAULTS.splits, infeasibleFallback: 'random' as never } }],
    ['missing template for a session type', { ...DEFAULTS, templates: DEFAULTS.templates.filter((t) => t.sessionType !== 'legs') }],
    ['template without a required primary objective', { ...DEFAULTS, templates: DEFAULTS.templates.map((t) => (t.id === 'upper' ? { ...t, objectives: t.objectives.filter((o) => o.role !== 'primary') } : t)) }],
    ['duplicate objective ids', { ...DEFAULTS, templates: DEFAULTS.templates.map((t) => (t.id === 'push' ? { ...t, objectives: [...t.objectives, t.objectives[0]] } : t)) }],
    ['objective with unknown substitute class', { ...DEFAULTS, templates: DEFAULTS.templates.map((t) => (t.id === 'pull' ? { ...t, objectives: t.objectives.map((o) => ({ ...o, substituteClasses: ['wobbly' as never] })) } : t)) }],
    ['objective with unknown repetition intent', { ...DEFAULTS, templates: DEFAULTS.templates.map((t) => (t.id === 'pull' ? { ...t, objectives: t.objectives.map((o) => ({ ...o, repetition: 'sometimes' as never })) } : t)) }],
    ['required conditioning finisher', { ...DEFAULTS, conditioningFinisher: { ...DEFAULTS.conditioningFinisher, objective: { ...DEFAULTS.conditioningFinisher.objective, requirement: 'always' } } }],
    ['selection weight out of range', withSelection({ fallbackPatternPenalty: 500 })],
    ['negative penalty', withSelection({ excessFatiguePenalty: -5 })],
    ['fallback tier ranked above standard', withSelection({ tierBonus: { staple: 3, standard: 0, fallback: 5 } })],
    ['weekly volume with inverted range', withWeeklyVolume({ targets: { ...DEFAULTS.weeklyVolume.targets, hypertrophy: { ...DEFAULTS.weeklyVolume.targets.hypertrophy, beginner: { ...DEFAULTS.weeklyVolume.targets.hypertrophy.beginner, chest: { min: 12, max: 3 } } } } })],
    ['weekly volume of 100 sets', withWeeklyVolume({ targets: { ...DEFAULTS.weeklyVolume.targets, strength: { ...DEFAULTS.weeklyVolume.targets.strength, advanced: { ...DEFAULTS.weeklyVolume.targets.strength.advanced, quads: { min: 10, max: 100 } } } } })],
    ['max sets per exercise below the minimum', withWeeklyVolume({ minSetsPerExercise: 4, maxSetsPerExercise: { beginner: 3, intermediate: 4, advanced: 5 } })],
    ['too many volume adjustments', withWeeklyVolume({ maxAdjustments: 500 })],
    ['conditional minimum for an unknown group', withWeeklyVolume({ conditionalMinimums: { forearms: { minResistanceSessions: 3, excludedStrategies: [] } } as never })],
    ['conditional minimum with an unknown split', withWeeklyVolume({ conditionalMinimums: { 'rear-delts': { minResistanceSessions: 3, excludedStrategies: ['bro-split' as never] } } })],
    ['conditional minimum needing 10 sessions', withWeeklyVolume({ conditionalMinimums: { 'rear-delts': { minResistanceSessions: 10, excludedStrategies: [] } } })],
    ['sequencing without conditioning last', { ...DEFAULTS, sequencing: { order: ['primary-compound', 'secondary-compound', 'other-compound', 'isolation', 'arms', 'conditioning', 'core'] } }],
    ['sequencing missing a category', { ...DEFAULTS, sequencing: { order: ['primary-compound', 'secondary-compound', 'isolation', 'arms', 'core', 'conditioning'] } }],
    ['unknown variation role', { ...DEFAULTS, variation: { rolesByStyle: { ...DEFAULTS.variation.rolesByStyle, general: { ...DEFAULTS.variation.rolesByStyle.general, advanced: ['finisher' as never] } } } }],
    ['load increase of 50%', { ...DEFAULTS, progression: { ...DEFAULTS.progression, loadIncreasePercent: { ...DEFAULTS.progression.loadIncreasePercent, strength: 50 } } }],
    ['zero seconds per rep', { ...DEFAULTS, duration: { ...DEFAULTS.duration, secondsPerRep: 0 } }],
  ])('rejects %s', (_, config) => {
    expect(validateWorkoutConfig(config)).not.toEqual([]);
  });
});
