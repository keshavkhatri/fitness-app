import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { GoalsService } from './goals.service';

const KEY = 'fitness.daily-goals';

function setup(storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }] });
  return { storage, goals: TestBed.inject(GoalsService) };
}

describe('GoalsService', () => {
  it('starts with the suggestions: 10,000 steps and no own water goal', async () => {
    const { goals } = setup();
    await goals.load();
    expect(goals.stepGoal()).toBe(10_000);
    expect(goals.waterOverrideMl()).toBeNull();
  });

  it('saves the person’s goals, reads them back, and can return to the suggestion', async () => {
    const { goals, storage } = setup();
    await goals.setSteps(7_500);
    await goals.setWaterMl(2_250);
    expect(goals.stepGoal()).toBe(7_500);
    expect(goals.waterOverrideMl()).toBe(2_250);

    TestBed.resetTestingModule();
    const again = setup(storage).goals;
    await again.load();
    expect(again.goals()).toEqual({ steps: 7_500, waterMl: 2_250 });

    await again.setSteps(null);
    await again.setWaterMl(null);
    expect(again.stepGoal()).toBe(10_000);
    expect(again.waterOverrideMl()).toBeNull();
  });

  it('rejects goals outside the range without touching storage, and keeps the old goal when a write fails', async () => {
    const { goals, storage } = setup();
    await expect(goals.setSteps(500)).rejects.toThrow(RangeError);
    await expect(goals.setSteps(60_000)).rejects.toThrow(RangeError);
    await expect(goals.setWaterMl(100)).rejects.toThrow(RangeError);
    expect(storage.values.has(KEY)).toBe(false);
    await goals.setSteps(8_000);
    storage.failWrites = true;
    await expect(goals.setSteps(9_000)).rejects.toThrow();
    expect(goals.stepGoal()).toBe(8_000);
  });

  it('unreadable or unknown-version settings read as the suggestions', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set(KEY, '{nope');
    const { goals } = setup(storage);
    await goals.load();
    expect(goals.stepGoal()).toBe(10_000);
    storage.values.set(KEY, JSON.stringify({ version: 9, goals: { steps: 8_000 } }));
    await goals.load();
    expect(goals.stepGoal()).toBe(10_000);
  });
});
