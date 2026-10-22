import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { PUSH_DEVICE, PushDevice, ReceivedPush } from '../reminders/push-device';
import { REMINDER_DEVICE, ReminderDevice, ShownNotification } from '../reminders/reminder-device';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationLogService } from './notification-log.service';
import { NotificationTrackingService } from './notification-tracking.service';

const NOW = new Date(2026, 9, 22, 12, 0);

function setup(delivered: ReceivedPush[] = []) {
  const handlers: {
    reminderTap?: (n: ShownNotification) => void;
    reminderShown?: (n: ShownNotification) => void;
    pushTap?: (p: ReceivedPush) => void;
    pushReceived?: (p: ReceivedPush) => void;
  } = {};
  const reminders = {
    available: true,
    onTap: (h) => void (handlers.reminderTap = h),
    onShown: (h) => void (handlers.reminderShown = h),
  } as Partial<ReminderDevice> as ReminderDevice;
  const push = {
    available: true,
    onTap: (h) => void (handlers.pushTap = h),
    onReceived: (h) => void (handlers.pushReceived = h),
    delivered: async () => delivered,
  } as Partial<PushDevice> as PushDevice;
  const nav = { navigateForward: vi.fn(async () => true), navigateBack: vi.fn(async () => true) };
  const storage = new MemoryKeyValueStorage();
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: REMINDER_DEVICE, useValue: reminders },
      { provide: PUSH_DEVICE, useValue: push },
      { provide: NavController, useValue: nav },
      { provide: FitnessAssessmentService, useValue: { current: () => Promise.resolve({ kind: 'unavailable' } as CurrentAssessment) } },
    ],
  });
  const tracking = TestBed.inject(NotificationTrackingService);
  tracking.start();
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { handlers, nav, tracking, settle, log: TestBed.inject(NotificationLogService), inbox: TestBed.inject(NotificationInboxService) };
}

const reminder: ShownNotification = {
  key: 'reminder:training:2026-10-22',
  kind: 'training',
  title: 'Upper Body A is on today',
  body: 'Your workout is ready when you are.',
  action: { kind: 'open-session', sessionId: 's1' },
  at: new Date(2026, 9, 22, 8, 0).toISOString(),
};

describe('NotificationTrackingService', () => {
  it('a tapped reminder opens its screen, is recorded at its own time, and is read in the inbox', async () => {
    const { handlers, nav, log, inbox, settle } = setup();
    handlers.reminderTap!(reminder);
    await settle();
    await log.record([]);
    await settle();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/workout', 'session', 's1']);
    expect(log.entries()).toEqual([expect.objectContaining({ key: 'reminder:training:2026-10-22', source: 'reminder', at: reminder.at })]);
    expect(inbox.isRead('sent:reminder:training:2026-10-22')).toBe(true);
  });

  it('a push received while open, then tapped, is one inbox item, read', async () => {
    const { handlers, log, inbox, settle } = setup();
    const push = { id: '0:111', title: 'Notifications are on', body: 'StokeForm can reach this phone.', data: { type: 'test' } };
    handlers.pushReceived!(push);
    await settle();
    handlers.pushTap!({ ...push, id: 'other-id' });
    await settle();
    await log.record([]);
    await settle();
    expect(log.entries()).toHaveLength(1);
    expect(inbox.isRead('sent:push:0:111')).toBe(true);
  });

  it('records pushes still in the shade, and a reminder shown while the app is open', async () => {
    const { handlers, log, settle } = setup([{ id: 'FCM-Notification:1', title: 'Hi', body: 'There', data: {} }]);
    await settle();
    handlers.reminderShown!(reminder);
    await settle();
    await log.record([]);
    expect(log.entries().map((e) => e.key).sort()).toEqual(['push:FCM-Notification:1', 'reminder:training:2026-10-22']);
  });
});
