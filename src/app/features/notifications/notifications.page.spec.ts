import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { PROFILE, planFor } from '../workout/testing/workout-fixtures';
import { scheduleWeek } from '../workout/workout-view-model';
import { sessionTitle } from '../workout/workout-formatting';
import { NotificationDetailPage } from './notification-detail.page';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationsPage } from './notifications.page';

/** Thursday 8 October 2026: a training day, nothing logged yet. */
const NOW = new Date(2026, 9, 8, 12, 30);
/** Thursday's planned session (the plan's weekly layout). */
const THURSDAY_SESSION = scheduleWeek(planFor(PROFILE))[3]!;
const SESSION_ID = THURSDAY_SESSION.id;
const PLANNED_TITLE = `${sessionTitle(THURSDAY_SESSION as Parameters<typeof sessionTitle>[0])} is planned today`;
const PLANNED_ID = `planned:${SESSION_ID}:2026-10-08`;

function configure(storage = new MemoryKeyValueStorage()) {
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current: () => Promise.resolve({ kind: 'unavailable' } as CurrentAssessment) } },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    navigateBack: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    router: vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true),
  };
}

async function renderInbox(filter?: string, storage?: MemoryKeyValueStorage) {
  const spies = configure(storage);
  const fixture = TestBed.createComponent(NotificationsPage);
  if (filter) {
    fixture.componentRef.setInput('filter', filter);
  }
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
  });
  const el = fixture.nativeElement as HTMLElement;
  const titles = () => [...el.querySelectorAll('.item-title')].map((t) => t.textContent?.trim());
  const show = (next: string) => {
    fixture.componentRef.setInput('filter', next);
    fixture.detectChanges();
  };
  return { ...spies, fixture, el, titles, show, inbox: TestBed.inject(NotificationInboxService) };
}

describe('NotificationsPage (inbox)', () => {
  it('lists today’s reminders as unread, dark, without marking them read', async () => {
    const { fixture, el, titles, inbox } = await renderInbox();
    expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-immersive');
    expect(titles()).toEqual([PLANNED_TITLE, 'How recovered do you feel?', 'Nothing logged yet today', 'Time to weigh in']);
    expect(el.querySelectorAll('.item.unread')).toHaveLength(4);
    expect(el.querySelector('.item .visually-hidden')?.textContent).toContain('Workout, today, unread');
    // Opening the inbox no longer marks everything read.
    expect(inbox.unreadCount()).toBe(4);
  });

  it('filters: Workouts and Nutrition by category (light), Unread by read state; the URL keeps the choice', async () => {
    const { fixture, titles, show, router, el } = await renderInbox();
    show('workout');
    expect(titles()).toEqual([PLANNED_TITLE]);
    expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-dashboard');
    show('nutrition');
    expect(titles()).toEqual(['Nothing logged yet today']);

    el.querySelectorAll<HTMLInputElement>('fit-segmented-control input')[1].click();
    expect(router).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { filter: 'unread' }, replaceUrl: true }));
  });

  it('the unread list updates as soon as one is read; "All caught up!" once none are left', async () => {
    const { titles, show, inbox, fixture, el } = await renderInbox('unread');
    await inbox.markRead(inbox.items()[0].id);
    fixture.detectChanges();
    expect(titles()).toHaveLength(3);

    el.querySelector<HTMLButtonElement>('[data-testid="mark-all-read"]')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="notifications-empty"]')?.textContent).toContain('All caught up!');
    });
    expect(el.querySelector('[data-testid="mark-all-read"]')).toBeNull();
    show('all');
    expect(titles()).toHaveLength(4); // still listed, just read
  });

  it('a category with nothing to show says so; an empty inbox says "No notifications yet"', async () => {
    const { el, show, inbox, fixture } = await renderInbox();
    const current = (inbox as unknown as { current: { set(items: unknown[]): void } }).current;
    current.set(inbox.items().filter((n) => n.category === 'workout'));
    show('nutrition');
    expect(el.querySelector('[data-testid="notifications-empty"]')?.textContent).toContain('No nutrition notifications');
    expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-dashboard');

    current.set([]);
    show('all');
    expect(el.querySelector('[data-testid="notifications-empty"]')?.textContent).toContain('No notifications yet');
    expect(el.querySelector('[data-testid="mark-all-read"]')).toBeNull();
  });

  it('opening a reminder opens its detail', async () => {
    const { el, forward, inbox } = await renderInbox();
    el.querySelector<HTMLButtonElement>('[data-testid="notification-planned"]')!.click();
    expect(forward).toHaveBeenCalledWith(['/home', 'notifications', inbox.items()[0].id]);
  });
});

describe('NotificationDetailPage', () => {
  async function renderDetail(id: string) {
    const spies = configure();
    const inbox = TestBed.inject(NotificationInboxService);
    const fixture = TestBed.createComponent(NotificationDetailPage);
    fixture.componentRef.setInput('notificationId', id);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    });
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...spies, inbox, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the reminder in full and marks it read (stored)', async () => {
    const { el, inbox, storage, fixture } = await renderDetail(PLANNED_ID);
    expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-dashboard');
    expect(el.querySelector('[data-testid="notification-title"]')?.textContent?.trim()).toBe(PLANNED_TITLE);
    expect(el.querySelector('[data-testid="notification-when"]')?.textContent?.trim()).toBe('Today · Thursday, October 8');
    expect(el.querySelector('[data-testid="notification-details"]')?.textContent).toContain('Estimated time');
    await vi.waitFor(() => expect(inbox.isRead(PLANNED_ID)).toBe(true));
    expect(storage.values.get('fitness.notifications-read')).toContain(PLANNED_ID);
  });

  it.each([
    [PLANNED_ID, 'View workout', ['/workout', 'session', SESSION_ID]],
    ['food:2026-10-08', 'Log food', ['/nutrition', 'food', 'new']],
    ['weigh-in:2026-10-08', 'Log weight', ['/you', 'weight-history', 'new']],
  ])('%s: its one action opens the existing screen', async (id, label, path) => {
    const { el, forward } = await renderDetail(id);
    const action = el.querySelector<HTMLButtonElement>('[data-testid="notification-action"]')!;
    expect(action.textContent?.trim()).toBe(label);
    action.click();
    expect(forward).toHaveBeenCalledWith(path, ...(String(id).startsWith('food') ? [{ queryParams: { date: '2026-10-08' } }] : []));
  });

  it('the recovery reminder opens Home’s check-in', async () => {
    const { el, navigateBack } = await renderDetail('recovery:2026-10-08');
    el.querySelector<HTMLButtonElement>('[data-testid="notification-action"]')!.click();
    expect(navigateBack).toHaveBeenCalledWith('/home', { queryParams: { checkIn: 'recovery' } });
  });

  it('a reminder that is no longer current says so, with no action, and marks nothing', async () => {
    const { el, inbox } = await renderDetail('food:2026-10-01');
    expect(el.querySelector('[data-testid="notification-gone"]')?.textContent).toContain('no longer available');
    expect(el.querySelector('[data-testid="notification-action"]')).toBeNull();
    expect(inbox.unreadCount()).toBe(4);
  });
});
