import { TestBed } from '@angular/core/testing';

import { createWeightEntry } from '../../domain/body-measurements';
import { createFoodEntry } from '../../domain/nutrition';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutHistoryService } from '../workout/workout-history.service';
import { ActivityStreakService } from './activity-streak.service';

const NOW = new Date(2026, 9, 8, 12, 0);

function setup(storage: MemoryKeyValueStorage) {
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
    ],
  });
  return TestBed.inject(ActivityStreakService);
}

describe('ActivityStreakService', () => {
  it('counts consecutive days with any recorded activity: workouts, food, weigh-ins and check-ins', async () => {
    const storage = new MemoryKeyValueStorage();
    // Oct 4 workout · Oct 5 food · Oct 6 weigh-in · Oct 7 steps · Oct 8 recovery check-in.
    storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs: [finishedLog({ startedAt: new Date(2026, 9, 4, 18), minutes: 40 })] }));
    const food = createFoodEntry(
      { name: 'Oats', quantity: 1, unit: 'g', meal: 'breakfast', calories: 200, proteinGrams: 5, carbohydrateGrams: 30, fatGrams: 3 },
      { id: 'f', date: '2026-10-05', now: '2026-10-05T08:00:00.000Z' },
    );
    storage.values.set('fitness.nutrition-entries', JSON.stringify({ version: 1, entries: food.ok ? [food.value] : [] }));
    const weight = createWeightEntry({ weight: 78, unitSystem: 'metric', date: '2026-10-06' }, { id: 'w', now: '2026-10-06T07:00:00.000Z', today: '2026-10-08' });
    storage.values.set('fitness.body-weight-entries', JSON.stringify({ version: 1, entries: weight.ok ? [weight.value] : [] }));
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: { '2026-10-07': 3000, '2026-10-03': 0 }, recovery: { '2026-10-08': 'fair' } }));

    expect(await setup(storage).current()).toBe(5);
  });

  it('zero steps is not activity; nothing recorded is 0', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: { '2026-10-08': 0 }, recovery: {} }));
    expect(await setup(storage).current()).toBe(0);
  });

  it('a source that can’t be read is skipped, not fatal', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: { '2026-10-08': 500 }, recovery: {} }));
    const service = setup(storage);
    vi.spyOn(TestBed.inject(WorkoutHistoryService), 'list').mockRejectedValue(new Error('corrupt'));
    expect(await service.current()).toBe(1);
  });
});
