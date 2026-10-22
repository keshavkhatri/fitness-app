import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WaterLogService } from './water-log.service';

const KEY = 'fitness.water-log';

function setup(storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => new Date(2026, 9, 22, 12, 0) },
    ],
  });
  return { storage, water: TestBed.inject(WaterLogService) };
}

describe('WaterLogService', () => {
  it('keeps one total per day: adding glasses adds up, setting replaces, and it reads back', async () => {
    const { water, storage } = setup();
    await Promise.all([water.add('2026-10-22', 250), water.add('2026-10-22', 250), water.add('2026-10-21', 500)]);
    expect(water.days()).toEqual({ '2026-10-22': 500, '2026-10-21': 500 });
    await water.set('2026-10-22', 1_750);
    expect(water.on('2026-10-22')).toBe(1_750);
    expect(water.on('2026-10-20')).toBe(0);

    TestBed.resetTestingModule();
    expect(await setup(storage).water.load()).toEqual({ '2026-10-22': 1_750, '2026-10-21': 500 });
  });

  it('rejects implausible totals and keeps the day within 0–10 L', async () => {
    const { water, storage } = setup();
    await expect(water.set('2026-10-22', -250)).rejects.toThrow(RangeError);
    await expect(water.set('2026-10-22', 10_250)).rejects.toThrow(RangeError);
    expect(storage.values.has(KEY)).toBe(false);
    await water.set('2026-10-22', 9_900);
    await water.add('2026-10-22', 250);
    expect(water.on('2026-10-22')).toBe(10_000);
  });

  it('carries over water kept with the daily check-ins before it moved to nutrition', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: {}, water: { '2026-10-22': 750, bad: 5 } }));
    const { water } = setup(storage);
    expect(await water.load()).toEqual({ '2026-10-22': 750 });
    await water.add('2026-10-22', 250);
    expect(JSON.parse(storage.values.get(KEY)!).days).toEqual({ '2026-10-22': 1_000 });
  });

  it('a failed write keeps the previous total', async () => {
    const { water, storage } = setup();
    storage.failWrites = true;
    await expect(water.add('2026-10-22', 250)).rejects.toThrow();
    expect(water.on('2026-10-22')).toBe(0);
  });

  it('the goal comes from the latest weigh-in, else the profile, else 3 L', async () => {
    expect(await setup().water.goalMl()).toBe(3_000);
  });
});
