import { HomeDayFacts, toHomeDay } from './home-today';
import { HomeWorkoutView } from './home-training';

const planned: HomeWorkoutView = {
  kind: 'resistance',
  sessionId: 'day-1-upper',
  title: 'Upper Body A',
  descriptor: 'Strength',
  countLabel: '7 exercises',
  durationLabel: 'About 45 min',
  minutes: 45,
  exercises: [],
  focusAreas: ['Chest', 'Back'],
  setsTotal: 22,
};
const rest: HomeWorkoutView = { kind: 'rest', message: '', upNext: null };
const day = (facts: Partial<HomeDayFacts> = {}) => toHomeDay({ workout: planned, finishedToday: false, steps: null, recovery: null, ...facts });
const tile = (view: ReturnType<typeof toHomeDay>, key: 'move' | 'train' | 'recover') => view.tiles.find((t) => t.key === key)!;

describe('Home "Your day, in motion"', () => {
  describe('the ring: the mean of today’s goals, each a share of its own target', () => {
    it('a fresh training day is 0%', () => {
      const view = day();
      expect(view.percent).toBe(0);
      expect(view.valueText).toBe("0% of today's goals");
      expect(view.status).toBe('A fresh day. Let’s get moving!');
    });

    it('steps, a finished workout and a check-in combine without mixing units', () => {
      // Move 8,200 / 10,000 = 82%, Train 1/1 = 100%, Recover good = 75% → 85.67 → 86%.
      expect(day({ steps: 8200, finishedToday: true, recovery: 'good' }).percent).toBe(86);
    });

    it('rest days leave Train out (two goals, not three)', () => {
      // (82% + 75%) / 2 = 78.5 → 79%.
      const view = day({ workout: rest, steps: 8200, recovery: 'good' });
      expect(view.percent).toBe(79);
      expect(tile(view, 'train')).toMatchObject({ value: 'Rest day', fraction: null });
    });

    it('caps each goal at 100% and reaches 100% only when every goal is met', () => {
      const full = day({ steps: 25_000, finishedToday: true, recovery: 'great' });
      expect(full.percent).toBe(100);
      expect(full.status).toBe('Every goal done. Great work!');
    });
  });

  describe('Move', () => {
    it('logged steps against the goal; none logged reads as 0', () => {
      expect(tile(day({ steps: 8240 }), 'move')).toMatchObject({ value: '8.2k', unit: 'steps', fraction: 0.824, action: { kind: 'log-steps' } });
      expect(tile(day({ steps: 8240 }), 'move').accessibleLabel).toBe('Move: 8,240 of 10,000 steps. Log steps.');
      expect(tile(day(), 'move')).toMatchObject({ value: '0', fraction: 0 });
    });
  });

  describe('Train', () => {
    it('planned and not done: 0/1, opens the workout', () => {
      expect(tile(day(), 'train')).toMatchObject({ value: '0/1', unit: 'done', fraction: 0, action: { kind: 'open-session', sessionId: 'day-1-upper' } });
    });

    it('finished today: 1/1, even on a rest day', () => {
      expect(tile(day({ finishedToday: true }), 'train')).toMatchObject({ value: '1/1', fraction: 1 });
      expect(tile(day({ workout: rest, finishedToday: true }), 'train')).toMatchObject({ value: '1/1', fraction: 1 });
    });

    it('in progress: the share of sets done, and it resumes', () => {
      const resume: HomeWorkoutView = { kind: 'resume', sessionId: 'day-1-upper', title: 'Upper Body A', progress: '11 of 22 sets done', setsDone: 11, setsTotal: 22 };
      expect(tile(day({ workout: resume }), 'train')).toMatchObject({ fraction: 0.5, action: { kind: 'resume', sessionId: 'day-1-upper' } });
    });

    it('no plan or an unavailable plan is left out of the ring', () => {
      expect(tile(day({ workout: { kind: 'no-profile' } }), 'train')).toMatchObject({ value: 'No plan', fraction: null, action: { kind: 'set-up-profile' } });
      expect(tile(day({ workout: { kind: 'unavailable' } }), 'train').fraction).toBeNull();
    });
  });

  describe('Recover', () => {
    it('the check-in level, or an invitation to check in (counted as 0)', () => {
      expect(tile(day({ recovery: 'good' }), 'recover')).toMatchObject({ value: 'Good', fraction: 0.75, action: { kind: 'check-in-recovery' } });
      expect(tile(day(), 'recover')).toMatchObject({ value: 'Check in', fraction: 0 });
    });
  });
});
