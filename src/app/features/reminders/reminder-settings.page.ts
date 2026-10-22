import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { IonBackButton, IonContent } from '@ionic/angular';

import { ReminderSettings, isClockTime } from '../../domain/reminders';
import { AuthService } from '../../core/auth/auth.service';
import { PushService, PushTestResult } from './push.service';
import { ReminderService } from './reminder.service';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const formatter = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Reminders: the master switch (asks for the system permission), one switch per kind with its time, quiet hours,
 * a daily limit, and the next few reminders as planned. Every change is saved at once and re-plans the schedule.
 */
@Component({
  selector: 'app-reminder-settings',
  template: `
    <ion-content>
      <main class="body">
        <div class="topbar">
          <ion-back-button class="back" defaultHref="/you/settings" text="" icon="chevron-back" aria-label="Back to settings" />
          <h1 class="title">Reminders</h1>
        </div>

        @if (!reminders.available) {
          <section class="card" data-testid="reminders-unavailable">
            <p class="hint">Reminders work in the StokeForm app on your phone.</p>
          </section>
        } @else if (loaded.hasValue()) {
          @let s = reminders.settings();
          <section class="card">
            <label class="toggle main">
              <span class="toggle-text">
                <span class="toggle-title">Reminders</span>
                <span class="hint">Training days, your streak, weigh-ins and more. Never more than {{ s.dailyCap }} a day.</span>
              </span>
              <input type="checkbox" role="switch" data-testid="reminders-enabled" [checked]="s.enabled" [disabled]="saving()" (change)="setEnabled($event)" />
            </label>
            @if (blocked()) {
              <p class="error" role="alert" data-testid="reminders-blocked">
                Notifications are off for StokeForm. Turn them on in your phone's Settings › Apps › StokeForm › Notifications, then try again.
              </p>
            }
          </section>

          @if (s.enabled) {
            <section class="card" aria-labelledby="reminders-kinds">
              <h2 class="setting-title" id="reminders-kinds">What to remind you about</h2>

              <div class="kind">
                <label class="toggle">
                  <span class="toggle-text"><span class="toggle-title">Training days</span><span class="hint">On days with a planned workout, until it's done.</span></span>
                  <input type="checkbox" role="switch" data-testid="reminder-training" [checked]="s.training.on" (change)="patch({ training: { ...s.training, on: checked($event) } })" />
                </label>
                @if (s.training.on) {
                  <label class="time">At <input type="time" [value]="s.training.time" (change)="time($event, (t) => ({ training: { ...s.training, time: t } }))" /></label>
                }
              </div>

              <div class="kind">
                <label class="toggle">
                  <span class="toggle-text"><span class="toggle-title">Workout left open</span><span class="hint">Two hours after your last logged set.</span></span>
                  <input type="checkbox" role="switch" [checked]="s.openWorkout.on" (change)="patch({ openWorkout: { on: checked($event) } })" />
                </label>
              </div>

              <div class="kind">
                <label class="toggle">
                  <span class="toggle-text"><span class="toggle-title">Streak at risk</span><span class="hint">When your streak is 3 days or more and nothing is logged yet today.</span></span>
                  <input type="checkbox" role="switch" [checked]="s.streak.on" (change)="patch({ streak: { ...s.streak, on: checked($event) } })" />
                </label>
                @if (s.streak.on) {
                  <label class="time">At <input type="time" [value]="s.streak.time" (change)="time($event, (t) => ({ streak: { ...s.streak, time: t } }))" /></label>
                }
              </div>

              <div class="kind">
                <label class="toggle">
                  <span class="toggle-text"><span class="toggle-title">Weekly weigh-in</span><span class="hint">Only when your last weigh-in is a week old.</span></span>
                  <input type="checkbox" role="switch" [checked]="s.weighIn.on" (change)="patch({ weighIn: { ...s.weighIn, on: checked($event) } })" />
                </label>
                @if (s.weighIn.on) {
                  <div class="time">
                    <label>
                      <span class="visually-hidden">Weigh-in day</span>
                      <select [value]="s.weighIn.weekday" (change)="patch({ weighIn: { ...s.weighIn, weekday: +$any($event.target).value } })">
                        @for (day of weekdays; track $index) {
                          <option [value]="$index" [selected]="$index === s.weighIn.weekday">{{ day }}</option>
                        }
                      </select>
                    </label>
                    <label>at <input type="time" [value]="s.weighIn.time" (change)="time($event, (t) => ({ weighIn: { ...s.weighIn, time: t } }))" /></label>
                  </div>
                }
              </div>

              <div class="kind">
                <label class="toggle">
                  <span class="toggle-text"><span class="toggle-title">Recovery check-in</span><span class="hint">A morning nudge, until you've checked in.</span></span>
                  <input type="checkbox" role="switch" [checked]="s.recovery.on" (change)="patch({ recovery: { ...s.recovery, on: checked($event) } })" />
                </label>
                @if (s.recovery.on) {
                  <label class="time">At <input type="time" [value]="s.recovery.time" (change)="time($event, (t) => ({ recovery: { ...s.recovery, time: t } }))" /></label>
                }
              </div>

              <div class="kind">
                <label class="toggle">
                  <span class="toggle-text"><span class="toggle-title">Log your meals</span><span class="hint">At lunch and dinner, until you've logged food that day.</span></span>
                  <input type="checkbox" role="switch" [checked]="s.meals.on" (change)="patch({ meals: { ...s.meals, on: checked($event) } })" />
                </label>
                @if (s.meals.on) {
                  <div class="time">
                    @for (t of s.meals.times; track $index; let i = $index) {
                      <label>{{ i === 0 ? 'At' : 'and' }} <input type="time" [value]="t" (change)="mealTime($event, i)" /></label>
                    }
                  </div>
                }
              </div>
            </section>

            <section class="card" aria-labelledby="reminders-limits">
              <h2 class="setting-title" id="reminders-limits">Quiet hours and limit</h2>
              <div class="time">
                <label>From <input type="time" [value]="s.quietHours.start" (change)="time($event, (t) => ({ quietHours: { ...s.quietHours, start: t } }))" /></label>
                <label>to <input type="time" [value]="s.quietHours.end" (change)="time($event, (t) => ({ quietHours: { ...s.quietHours, end: t } }))" /></label>
              </div>
              <p class="hint">Nothing is sent in quiet hours.</p>
              <div class="cap">
                <span>At most</span>
                <button type="button" class="step" aria-label="Fewer a day" [disabled]="s.dailyCap <= 1" (click)="patch({ dailyCap: s.dailyCap - 1 })">−</button>
                <span class="cap-value" data-testid="reminders-cap">{{ s.dailyCap }}</span>
                <button type="button" class="step" aria-label="More a day" [disabled]="s.dailyCap >= 6" (click)="patch({ dailyCap: s.dailyCap + 1 })">+</button>
                <span>a day</span>
              </div>
            </section>

            @if (push.available && signedIn()) {
              <section class="card" aria-labelledby="reminders-push">
                <h2 class="setting-title" id="reminders-push">Account notifications</h2>
                <p class="hint">
                  {{ push.registered() ? 'This phone gets notifications for your account.' : 'Connecting this phone to your account…' }}
                </p>
                <button type="button" class="test" data-testid="reminders-push-test" [disabled]="testing()" (click)="sendTest()">
                  {{ testing() ? 'Sending…' : 'Send a test notification' }}
                </button>
                @if (testResult(); as r) {
                  <p class="hint" role="status" data-testid="reminders-push-result">{{ testMessages[r] }}</p>
                }
              </section>
            }

            <section class="card" aria-labelledby="reminders-next">
              <h2 class="setting-title" id="reminders-next">Coming up</h2>
              @if (upcoming().length) {
                <ul class="next" data-testid="reminders-upcoming">
                  @for (r of upcoming(); track r.id) {
                    <li><span class="when">{{ r.when }}</span><span>{{ r.title }}</span></li>
                  }
                </ul>
              } @else {
                <p class="hint">Nothing in the next 7 days with these settings.</p>
              }
            </section>
          }
        }
      </main>
    </ion-content>
  `,
  styleUrl: './reminder-settings.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [IonContent, IonBackButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReminderSettingsPage {
  protected readonly reminders = inject(ReminderService);
  protected readonly loaded = resource({ loader: () => this.reminders.load() });
  protected readonly saving = signal(false);
  protected readonly push = inject(PushService);
  private readonly auth = inject(AuthService);
  protected readonly signedIn = computed(() => this.auth.state().status === 'signed-in');
  protected readonly testing = signal(false);
  protected readonly testResult = signal<PushTestResult | null>(null);
  protected readonly testMessages: Readonly<Record<PushTestResult, string>> = {
    sent: 'Sent. It should arrive in a few seconds.',
    'no-device': "This phone isn't connected yet. Try again in a moment.",
    'too-soon': 'Wait half a minute before sending another.',
    failed: "Couldn't send it. Check your connection and try again.",
  };
  protected readonly blocked = computed(() => this.reminders.permission() === 'denied');
  protected readonly weekdays = WEEKDAYS;
  private queue: Promise<unknown> = Promise.resolve();
  protected readonly upcoming = computed(() =>
    this.reminders
      .planned()
      .slice(0, 5)
      .map((r) => ({ id: r.id, title: r.title, when: formatter.format(r.at) })),
  );

  protected async sendTest(): Promise<void> {
    this.testing.set(true);
    try {
      this.testResult.set(await this.push.sendTest());
    } finally {
      this.testing.set(false);
    }
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected async setEnabled(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    this.saving.set(true);
    try {
      await this.patch({ enabled: input.checked });
      input.checked = this.reminders.settings().enabled;
    } finally {
      this.saving.set(false);
    }
  }

  protected time(event: Event, change: (time: string) => Partial<ReminderSettings>): void {
    const value = (event.target as HTMLInputElement).value;
    if (isClockTime(value)) {
      void this.patch(change(value));
    }
  }

  protected mealTime(event: Event, index: number): void {
    const s = this.reminders.settings();
    this.time(event, (t) => ({ meals: { ...s.meals, times: s.meals.times.map((old, i) => (i === index ? t : old)) } }));
  }

  /** Changes apply one after another, each onto the settings the previous one saved (quick taps don't undo each other). */
  protected patch(change: Partial<ReminderSettings>): Promise<void> {
    const next = this.queue.then(() => this.reminders.save({ ...this.reminders.settings(), ...change })).then(() => undefined);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
