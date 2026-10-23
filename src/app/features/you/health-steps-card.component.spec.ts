import { TestBed } from '@angular/core/testing';

import { HEALTH_STEPS_DEVICE, HealthStepsDevice, HealthStepsStatus, NO_HEALTH_STEPS } from '../../core/health/health-steps-device';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { HealthStepsCardComponent } from './health-steps-card.component';

function fakeDevice({ available = true, granted = false, answer = true } = {}) {
  const state: { -readonly [K in keyof HealthStepsStatus]: HealthStepsStatus[K] } = { available, granted };
  const device: HealthStepsDevice = {
    supported: true,
    status: async () => ({ ...state }),
    requestPermission: async () => {
      state.granted = answer;
      return { ...state };
    },
    readSteps: async () => [{ date: '2026-10-23', steps: 4_200 }],
    openSettings: vi.fn(async () => undefined),
  };
  return device;
}

async function render(device: HealthStepsDevice) {
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() },
      { provide: CLOCK, useValue: () => new Date(2026, 9, 23, 12, 0) },
      { provide: HEALTH_STEPS_DEVICE, useValue: device },
    ],
  });
  const fixture = TestBed.createComponent(HealthStepsCardComponent);
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    q(id)!.click();
    await settle();
  };
  return { el, q, click, status: () => q('health-steps-status')?.textContent?.trim() };
}

describe('HealthStepsCardComponent (Settings › Step counting)', () => {
  it('is not shown in the web build', async () => {
    const { el } = await render(NO_HEALTH_STEPS);
    expect(el.querySelector('[data-testid="health-steps"]')).toBeNull();
  });

  it('says it is not available on a phone without Health Connect', async () => {
    const { el, status } = await render(fakeDevice({ available: false }));
    expect(status()).toBe('Not available on this phone');
    expect(el.textContent).toContain('Android 14');
  });

  it('is off at first, and Connect asks for permission and turns it on', async () => {
    const { q, click, status } = await render(fakeDevice());
    expect(status()).toBe('Off. You type your steps in');
    await click('health-steps-connect');
    expect(status()).toMatch(/^On\. Updated /);
    expect(q('health-steps-sync')).not.toBeNull();
  });

  it('a refused permission offers to try again or open Health Connect', async () => {
    const device = fakeDevice({ answer: false });
    const { q, click, status } = await render(device);
    await click('health-steps-connect');
    expect(status()).toBe('Permission needed');
    await click('health-steps-settings');
    expect(device.openSettings).toHaveBeenCalled();
    expect(q('health-steps-allow')).not.toBeNull();
  });

  it('Turn off goes back to off', async () => {
    const { click, status } = await render(fakeDevice());
    await click('health-steps-connect');
    await click('health-steps-off');
    expect(status()).toBe('Off. You type your steps in');
  });
});
