import { LOG_LIMIT, SentNotification, mergeSent, parseSentNotifications, toInboxItem } from './notification-log';
import { buildInbox, groupByDay } from './notifications';

const NOW = new Date('2026-10-22T12:00:00Z');
const entry = (over: Partial<SentNotification> = {}): SentNotification => ({
  key: 'reminder:training:2026-10-22',
  source: 'reminder',
  kind: 'training',
  title: 'Upper Body A is on today',
  body: 'Your workout is ready when you are.',
  at: '2026-10-22T08:00:00.000Z',
  action: { kind: 'open-session', sessionId: 's1' },
  ...over,
});
const utcDate = (d: Date) => d.toISOString().slice(0, 10);

describe('notification log', () => {
  it('records each notification once, newest first', () => {
    const merged = mergeSent([entry()], [entry({ title: 'changed' }), entry({ key: 'reminder:meals:2026-10-22:0', kind: 'meals', at: '2026-10-22T11:00:00.000Z' })], NOW);
    expect(merged.map((e) => e.key)).toEqual(['reminder:meals:2026-10-22:0', 'reminder:training:2026-10-22']);
    expect(merged[1].title).toBe('Upper Body A is on today');
  });

  it('treats a push with the same text heard of twice (received, then tapped) as one', () => {
    const push = entry({ key: 'push:0:1', source: 'push', kind: null, title: 'Notifications are on', action: null, at: '2026-10-22T11:50:00.000Z' });
    const tapped = { ...push, key: 'push:FCM-Notification:9', at: '2026-10-22T11:55:00.000Z' };
    expect(mergeSent([push], [tapped], NOW)).toHaveLength(1);
    // The same text a day later is a new push.
    expect(mergeSent([push], [{ ...tapped, at: '2026-10-23T11:55:00.000Z' }], NOW)).toHaveLength(2);
  });

  it('keeps 30 days and at most the limit', () => {
    expect(mergeSent([], [entry({ at: '2026-09-01T08:00:00.000Z' })], NOW)).toEqual([]);
    const many = Array.from({ length: LOG_LIMIT + 5 }, (_, i) => entry({ key: `k${i}`, at: new Date(NOW.getTime() - i * 60_000).toISOString() }));
    expect(mergeSent([], many, NOW)).toHaveLength(LOG_LIMIT);
  });

  it('reads stored entries strictly', () => {
    expect(parseSentNotifications([entry(), { key: 1 }, entry({ at: 'nope' }), entry({ action: { kind: 'hack' } as never })])).toEqual([
      entry(),
      entry({ action: null }),
    ]);
    expect(parseSentNotifications('x')).toEqual([]);
  });

  it('becomes an inbox item with its day and time; a push is general news without an action', () => {
    const item = toInboxItem(entry(), utcDate);
    expect(item).toEqual(expect.objectContaining({ id: 'sent:reminder:training:2026-10-22', category: 'workout', date: '2026-10-22', at: entry().at }));
    expect(item.details[0].label).toBe('Sent');
    const push = toInboxItem(entry({ source: 'push', kind: null, action: null }), utcDate);
    expect(push).toEqual(expect.objectContaining({ category: 'general', icon: 'notifications', action: null }));
    expect(push.details[0].label).toBe('Received');
  });

  it('the inbox drops a to-do a notification already covers, and groups by day', () => {
    const todo = { ...toInboxItem(entry(), utcDate), id: 'planned:s1:2026-10-22', at: null };
    const food = { ...todo, id: 'food:2026-10-22' };
    const sentToday = toInboxItem(entry(), utcDate);
    const sentYesterday = toInboxItem(entry({ key: 'push:x', at: '2026-10-21T09:00:00.000Z' }), utcDate);
    const inbox = buildInbox([todo, food], [sentYesterday, sentToday], new Set(['planned']));
    expect(inbox.map((n) => n.id)).toEqual(['food:2026-10-22', 'sent:reminder:training:2026-10-22', 'sent:push:x']);
    expect(groupByDay(inbox, '2026-10-22').map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ]);
  });
});
