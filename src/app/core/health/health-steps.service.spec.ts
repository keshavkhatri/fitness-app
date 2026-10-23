import { TestBed } from '@angular/core/testing';

import { DailyCheckInService } from '../daily-check-in/daily-check-in.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { HEALTH_STEPS_DEVICE, HealthStepsDevice, HealthStepsStatus, NO_HEALTH_STEPS, StepDay } from './health-steps-device';
import { HealthStepsService } from './health-steps.service';

const NOW = new Date(2026, 9, 23, 12, 0);

function fakeDevice({ available = true, granted = false, answer = true } = {}) {
  const state: { -readonly [K in keyof HealthStepsStatus]: HealthStepsStatus[K] } = { available, granted };
  const days: StepDay[] = [
    { date: '2026-10-23', steps: 4_200 },
    { date: '2026-10-22', steps: 9_100 },
    { date: '2026-10-21', steps: 0 },
  ];
  const device: HealthStepsDevice = {
    supported: true,
    status: async () => ({ ...state }),
    requestPermission: vi.fn(async () => {
      state.granted = answer;
      return { ...state };
    }),
    readSteps: vi.fn(async () => days),
    openSettings: vi.fn(async () => undefined),
  };
  return { device, state, days };
}

function setup(device: HealthStepsDevice, storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: HEALTH_STEPS_DEVICE, useValue: device },
    ],
  });
  return { storage, health: TestBed.inject(HealthStepsService), checkIns: TestBed.inject(DailyCheckInService) };
}

describe('HealthStepsService', () => {
  it('is unsupported on the web and on phones without Health Connect (steps stay typed)', async () => {
    const web = setup(NO_HEALTH_STEPS);
    await web.health.load();
    expect(web.health.supported).toBe(false);
    expect(web.health.state()).toBe('unsupported');
    TestBed.resetTestingModule();
    const old = setup(fakeDevice({ available: false }).device);
    await old.health.load();
    expect(old.health.state()).toBe('unsupported');
  });

  it('is off until the person turns it on, and reads nothing before that', async () => {
    const { device } = fakeDevice();
    const { health } = setup(device);
    await health.load();
    expect(health.state()).toBe('off');
    await health.sync();
    expect(device.readSteps).not.toHaveBeenCalled();
  });

  it('turning it on asks for permission, then copies the phone’s steps (not days with none) and remembers the choice', async () => {
    const { device } = fakeDevice();
    const { health, checkIns, storage } = setup(device);
    await health.load();
    expect(await health.connect()).toBe(true);
    expect(health.state()).toBe('connected');
    expect(device.requestPermission).toHaveBeenCalledTimes(1);
    expect(checkIns.checkIns().steps).toEqual({ '2026-10-23': 4_200, '2026-10-22': 9_100 });
    expect(health.lastSyncedAt()).toBe(NOW.toISOString());
    expect(JSON.parse(storage.values.get('stokeform.health-steps')!)).toEqual({ version: 1, enabled: true });

    TestBed.resetTestingModule();
    const again = setup(fakeDevice({ granted: true }).device, storage);
    await again.health.load();
    expect(again.health.state()).toBe('connected');
  });

  it('the phone’s total replaces a typed number for that day; a day it has nothing for keeps the typed one', async () => {
    const { device, days } = fakeDevice({ granted: true });
    const { health, checkIns } = setup(device);
    await checkIns.setSteps('2026-10-23', 1_000);
    await checkIns.setSteps('2026-10-21', 3_333);
    await health.load();
    await health.connect();
    expect(checkIns.checkIns().steps['2026-10-23']).toBe(4_200);
    expect(checkIns.checkIns().steps['2026-10-21']).toBe(3_333);
    // A later sync with more steps updates it again, and one with the same steps writes nothing.
    days[0] = { date: '2026-10-23', steps: 5_000 };
    await health.sync();
    expect(checkIns.checkIns().steps['2026-10-23']).toBe(5_000);
    const writes = vi.spyOn(TestBed.inject(KeyValueStorage), 'set');
    await health.sync();
    expect(writes).not.toHaveBeenCalledWith('fitness.daily-check-ins', expect.anything());
  });

  it('a refused permission leaves it needing permission: nothing is read, and the person can try again or open settings', async () => {
    const { device } = fakeDevice({ answer: false });
    const { health, checkIns } = setup(device);
    await health.load();
    expect(await health.connect()).toBe(false);
    expect(health.state()).toBe('needs-permission');
    expect(device.readSteps).not.toHaveBeenCalled();
    expect(checkIns.checkIns().steps).toEqual({});
    await health.openSettings();
    expect(device.openSettings).toHaveBeenCalled();
  });

  it('a permission taken away in Health Connect is noticed on the next sync', async () => {
    const { device, state } = fakeDevice({ granted: true });
    const { health } = setup(device);
    await health.load();
    await health.connect();
    expect(health.state()).toBe('connected');
    state.granted = false;
    await health.sync();
    expect(health.state()).toBe('needs-permission');
  });

  it('turning it off stops the copying and keeps typed steps', async () => {
    const { device } = fakeDevice({ granted: true });
    const { health, checkIns } = setup(device);
    await health.load();
    await health.connect();
    await health.disconnect();
    expect(health.state()).toBe('off');
    (device.readSteps as ReturnType<typeof vi.fn>).mockClear();
    await health.sync();
    expect(device.readSteps).not.toHaveBeenCalled();
    expect(checkIns.checkIns().steps['2026-10-22']).toBe(9_100);
  });

  it('a failed read is reported, never thrown, and the next sync can succeed', async () => {
    const { device } = fakeDevice({ granted: true });
    const { health } = setup(device);
    await health.load();
    await health.connect();
    (device.readSteps as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('read-failed'));
    await expect(health.sync()).resolves.toBeUndefined();
    expect(health.failed()).toBe(true);
    await health.sync();
    expect(health.failed()).toBe(false);
  });
});
