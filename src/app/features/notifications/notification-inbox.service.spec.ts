import { TestBed } from '@angular/core/testing';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { PROFILE } from '../workout/testing/workout-fixtures';
import { NotificationInboxService } from './notification-inbox.service';

/** Thursday 8 October 2026: a training day for the 4-day plan. */
const NOW = new Date(2026, 9, 8, 12, 30);

function setup(storage = new MemoryKeyValueStorage()) {
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current: () => Promise.resolve({ kind: 'unavailable' } as CurrentAssessment) } },
    ],
  });
  return { storage, inbox: TestBed.inject(NotificationInboxService) };
}

describe('NotificationInboxService', () => {
  it('builds today’s reminders from stored data, all unread at first', async () => {
    const { inbox } = setup();
    const items = await inbox.refresh();
    expect(items.map((n) => n.action?.kind)).toEqual(['open-session', 'recovery-check-in', 'log-food', 'log-weight']);
    expect(inbox.unreadCount()).toBe(4);
  });

  it('marking all read persists, so the next refresh has nothing unread', async () => {
    const { inbox, storage } = setup();
    await inbox.refresh();
    await inbox.markAllRead();
    expect(inbox.unreadCount()).toBe(0);
    expect(JSON.parse(storage.values.get('fitness.notifications-read')!).ids).toHaveLength(4);

    TestBed.resetTestingModule();
    const again = setup(storage).inbox;
    await again.refresh();
    expect(again.unreadCount()).toBe(0);
  });

  it('marking one read persists it alone, and refreshing never duplicates reminders', async () => {
    const { inbox, storage } = setup();
    const [first] = await inbox.refresh();
    await inbox.markRead(first.id);
    expect(inbox.isRead(first.id)).toBe(true);
    expect(inbox.unreadCount()).toBe(3);

    await inbox.refresh();
    await inbox.refresh();
    expect(inbox.items()).toHaveLength(4);
    expect(new Set(inbox.items().map((n) => n.id)).size).toBe(4);

    TestBed.resetTestingModule();
    const again = setup(storage).inbox;
    await again.refresh();
    expect(again.isRead(first.id)).toBe(true);
    expect(again.unreadCount()).toBe(3);
    expect(again.find(first.id)?.title).toBe(first.title);
    expect(again.find('food:2026-01-01')).toBeNull();
  });

  it('lists what the phone showed, newest first, and a reminder shown today stands for its to-do', async () => {
    const storage = new MemoryKeyValueStorage();
    const sent = (key: string, kind: string | null, at: string, title: string) => ({
      key,
      source: kind ? 'reminder' : 'push',
      kind,
      title,
      body: 'b',
      at: new Date(at).toISOString(),
      action: kind === 'training' ? { kind: 'open-session', sessionId: 's1' } : null,
    });
    storage.values.set(
      'stokeform.notification-log',
      JSON.stringify({
        version: 1,
        entries: [
          sent('reminder:training:2026-10-08', 'training', '2026-10-08T08:00:00', 'Upper Body A is on today'),
          sent('push:abc', null, '2026-10-07T18:00:00', 'Notifications are on'),
        ],
      }),
    );
    const { inbox } = setup(storage);
    const items = await inbox.refresh();
    expect(items.map((n) => n.id)).toEqual([
      'recovery:2026-10-08',
      'food:2026-10-08',
      'weigh-in:2026-10-08',
      'sent:reminder:training:2026-10-08',
      'sent:push:abc',
    ]);
    const push = inbox.find('sent:push:abc')!;
    expect(push).toEqual(expect.objectContaining({ category: 'general', date: '2026-10-07', action: null }));
    expect(inbox.unreadCount()).toBe(5);
  });

  it('marking read before the inbox was opened keeps what was already read', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.notifications-read', JSON.stringify({ version: 1, ids: ['food:2026-10-08'] }));
    const { inbox } = setup(storage);
    await inbox.markRead('sent:push:abc');
    expect(JSON.parse(storage.values.get('fitness.notifications-read')!).ids).toEqual(['food:2026-10-08', 'sent:push:abc']);
  });

  it('a check-in saved today removes its reminder', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: {}, recovery: { '2026-10-08': 'good' } }));
    const { inbox } = setup(storage);
    expect((await inbox.refresh()).map((n) => n.action?.kind)).not.toContain('recovery-check-in');
  });

  it('a failed write keeps reminders unread', async () => {
    const storage = new MemoryKeyValueStorage();
    const { inbox } = setup(storage);
    await inbox.refresh();
    vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('full'));
    await expect(inbox.markAllRead()).rejects.toThrow('full');
    expect(inbox.unreadCount()).toBe(4);
  });
});
