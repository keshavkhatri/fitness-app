import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { NotificationLogService } from '../notifications/notification-log.service';
import { REMINDER_DEVICE, ReminderDevice } from './reminder-device';
import { ReminderService } from './reminder.service';

const NOW = new Date(2026, 9, 22, 12, 0);

describe('ReminderService', () => {
  it('re-planning records the last plan’s reminders whose time came as shown (the inbox lists them)', async () => {
    const storage = new MemoryKeyValueStorage();
    const planned = (key: string, at: Date) => ({ key, kind: 'training', at: at.toISOString(), title: 'T', body: 'B', action: { kind: 'log-food' } });
    storage.values.set(
      'stokeform.reminders-planned',
      JSON.stringify([planned('training:2026-10-22', new Date(2026, 9, 22, 8, 0)), planned('training:2026-10-23', new Date(2026, 9, 23, 8, 0))]),
    );
    const device = {
      available: true,
      permission: async () => 'granted',
      requestPermission: async () => 'granted',
      schedule: async () => undefined,
      cancel: async () => undefined,
      onTap: () => undefined,
      onShown: () => undefined,
    } as ReminderDevice;
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => NOW },
        { provide: REMINDER_DEVICE, useValue: device },
      ],
    });
    await TestBed.inject(ReminderService).refresh();
    expect(TestBed.inject(NotificationLogService).entries().map((e) => e.key)).toEqual(['reminder:training:2026-10-22']);
    // Reminders off: nothing is planned any more, so nothing is recorded twice later.
    expect(JSON.parse(storage.values.get('stokeform.reminders-planned')!)).toEqual([]);
  });
});
