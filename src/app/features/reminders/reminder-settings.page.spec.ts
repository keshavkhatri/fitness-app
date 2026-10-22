import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { PlannedReminder } from '../../domain/reminders';
import { REMINDER_DEVICE, ReminderDevice, ReminderPermission } from './reminder-device';
import { ReminderSettingsPage } from './reminder-settings.page';

// Thursday 22 October 2026, 06:00 local.
const NOW = new Date(2026, 9, 22, 6, 0);

function fakeDevice(answer: ReminderPermission, available = true) {
  const state = { permission: 'prompt' as ReminderPermission, scheduled: [] as PlannedReminder[], cancelled: [] as number[] };
  const device: ReminderDevice = {
    available,
    permission: async () => state.permission,
    requestPermission: async () => (state.permission = answer),
    schedule: async (r) => void state.scheduled.push(...r),
    cancel: async (ids) => void state.cancelled.push(...ids),
    onTap: () => undefined,
    onShown: () => undefined,
  };
  return { device, state };
}

async function render(device: ReminderDevice, storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: REMINDER_DEVICE, useValue: device },
    ],
  });
  const fixture = TestBed.createComponent(ReminderSettingsPage);
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(id: string) => el.querySelector<T & HTMLElement>(`[data-testid=${id}]`);
  return { el, settle, q, storage };
}

describe('ReminderSettingsPage', () => {
  it('explains that reminders need the phone app on the web build', async () => {
    const { q } = await render(fakeDevice('granted', false).device);
    expect(q('reminders-unavailable')).not.toBeNull();
    expect(q('reminders-enabled')).toBeNull();
  });

  it('turning reminders on asks for permission, then shows the kinds and saves', async () => {
    const { device, state } = fakeDevice('granted');
    const { q, settle, storage } = await render(device);
    const toggle = q<HTMLInputElement>('reminders-enabled')!;
    expect(toggle.checked).toBe(false);
    expect(q('reminder-training')).toBeNull();

    toggle.click();
    await settle();
    expect(state.permission).toBe('granted');
    expect(q<HTMLInputElement>('reminders-enabled')!.checked).toBe(true);
    expect(q<HTMLInputElement>('reminder-training')!.checked).toBe(true);
    expect(JSON.parse((await storage.get('stokeform.reminder-settings'))!).settings.enabled).toBe(true);
  });

  it('stays off and says how to fix it when the permission is refused', async () => {
    const { device } = fakeDevice('denied');
    const { q, settle } = await render(device);
    q<HTMLInputElement>('reminders-enabled')!.click();
    await settle();
    expect(q<HTMLInputElement>('reminders-enabled')!.checked).toBe(false);
    expect(q('reminders-blocked')).not.toBeNull();
    expect(q('reminder-training')).toBeNull();
  });

  it('changes the daily limit within bounds', async () => {
    const { device } = fakeDevice('granted');
    const { q, el, settle } = await render(device);
    q<HTMLInputElement>('reminders-enabled')!.click();
    await settle();
    expect(q('reminders-cap')!.textContent!.trim()).toBe('2');
    el.querySelector<HTMLButtonElement>('[aria-label="More a day"]')!.click();
    await settle();
    expect(q('reminders-cap')!.textContent!.trim()).toBe('3');
  });
});
