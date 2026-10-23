import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { DailyCheckInService } from './daily-check-in.service';

const KEY = 'fitness.daily-check-ins';

function setup(storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => new Date(2026, 9, 8, 23, 30) },
    ],
  });
  return { storage, service: TestBed.inject(DailyCheckInService) };
}

describe('DailyCheckInService', () => {
  it('today is the local calendar date', () => {
    expect(setup().service.today()).toBe('2026-10-08');
  });

  it('saves steps and recovery per day, replacing that day’s value, and reads them back', async () => {
    const { service, storage } = setup();
    await service.setSteps('2026-10-08', 4000);
    await service.setSteps('2026-10-08', 8200);
    await service.setRecovery('2026-10-08', 'good');
    expect(service.checkIns()).toEqual({ steps: { '2026-10-08': 8200 }, recovery: { '2026-10-08': 'good' }, activity: {} });

    TestBed.resetTestingModule();
    const again = setup(storage).service;
    expect(await again.load()).toEqual({ steps: { '2026-10-08': 8200 }, recovery: { '2026-10-08': 'good' }, activity: {} });
  });

  it('rejects invalid values without touching stored data', async () => {
    const { service, storage } = setup();
    await expect(service.setSteps('2026-10-08', -1)).rejects.toThrow(RangeError);
    await expect(service.setSteps('2026-10-08', 1.5)).rejects.toThrow(RangeError);
    await expect(service.setRecovery('2026-10-08', 'amazing' as never)).rejects.toThrow(RangeError);
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('takes the device’s step totals: replaces a day, skips empty or invalid days, and writes only when something changed', async () => {
    const { service, storage } = setup();
    await service.setSteps('2026-10-08', 1_000);
    expect(await service.applyDeviceSteps({ '2026-10-08': 4_000, '2026-10-07': 6_500, '2026-10-06': 0, 'not-a-date': 5, '2026-10-05': -3 })).toBe(2);
    expect(service.checkIns().steps).toEqual({ '2026-10-08': 4_000, '2026-10-07': 6_500 });
    const writes = vi.spyOn(storage, 'set');
    expect(await service.applyDeviceSteps({ '2026-10-08': 4_000, '2026-10-07': 6_500 })).toBe(0);
    expect(writes).not.toHaveBeenCalled();
  });

  it('a failed write keeps the previous state', async () => {
    const { service, storage } = setup();
    storage.failWrites = true;
    await expect(service.setSteps('2026-10-08', 100)).rejects.toThrow();
    expect(service.checkIns().steps).toEqual({});
  });

  it('unknown versions and corrupt data read as empty', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set(KEY, JSON.stringify({ version: 9, steps: { '2026-10-08': 1 } }));
    expect(await setup(storage).service.load()).toEqual({ steps: {}, recovery: {}, activity: {} });
    TestBed.resetTestingModule();
    storage.values.set(KEY, '{nope');
    expect(await setup(storage).service.load()).toEqual({ steps: {}, recovery: {}, activity: {} });
  });
});
