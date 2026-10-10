import { WeightEntry, createWeightEntry } from '../../domain/body-measurements';
import { toHomeWeight } from './home-weight';

const TODAY = '2026-10-08';
const entry = (id: string, date: string, weight: number, unitSystem: 'metric' | 'imperial' = 'metric'): WeightEntry => {
  const r = createWeightEntry({ weight, unitSystem, date }, { id, now: `${date}T08:00:00.000Z`, today: TODAY });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const ready = (entries: WeightEntry[], unitSystem: 'metric' | 'imperial' = 'metric') => ({ status: 'ready' as const, entries, unitSystem });

describe('Home weight tile', () => {
  it('shows the latest weight, a neutral 30-day change and the recorded points', () => {
    const view = toHomeWeight(ready([entry('a', '2026-09-20', 79.6), entry('b', '2026-10-01', 79), entry('c', '2026-10-07', 78.4)]), TODAY);
    expect(view).toMatchObject({ kind: 'ready', value: '78.4', unit: 'kg', dateLabel: 'Yesterday', change: '−1.2 kg · 30 days' });
    if (view?.kind !== 'ready') {
      throw new Error('ready');
    }
    // Only recorded points, oldest first: highest first (top), lowest last (bottom).
    expect(view.points).toEqual([
      { x: 0, y: 10 },
      { x: 50, y: 50 },
      { x: 100, y: 90 },
    ]);
    expect(view.accessibleLabel).toBe(
      'Body weight 78.4 kilograms, recorded Yesterday. Change over the last 30 days: −1.2 kilograms. Open weight history.',
    );
  });

  it('a single weigh-in has no change and no line', () => {
    const view = toHomeWeight(ready([entry('a', '2026-10-08', 80)]), TODAY);
    expect(view).toMatchObject({ kind: 'ready', value: '80.0', dateLabel: 'Today', change: null, points: [] });
  });

  it('nothing in the last 30 days still shows the latest weigh-in, without a change', () => {
    const view = toHomeWeight(ready([entry('a', '2026-06-01', 81), entry('b', '2026-07-01', 80.5)]), TODAY);
    expect(view).toMatchObject({ kind: 'ready', value: '80.5', change: null, points: [] });
  });

  it('uses the profile’s units', () => {
    const view = toHomeWeight(ready([entry('a', '2026-10-01', 176), entry('b', '2026-10-08', 176)], 'imperial'), TODAY);
    expect(view).toMatchObject({ kind: 'ready', unit: 'lb', change: 'No change · 30 days' });
  });

  it('no weigh-ins, an unreadable history and loading are reported as such', () => {
    expect(toHomeWeight(ready([]), TODAY)).toEqual({ kind: 'empty' });
    expect(toHomeWeight({ status: 'error' }, TODAY)).toEqual({ kind: 'error' });
    expect(toHomeWeight({ status: 'loading' }, TODAY)).toBeNull();
  });
});
