import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';

import { AuthError } from '../../core/auth/auth-api';
import { AuthService } from '../../core/auth/auth.service';
import { SUPPORT_EMAIL } from '../../core/legal/legal-links';
import { FitnessButtonComponent, TextFieldComponent } from '../../shared/ui';
import { AccountDataService } from './account-data.service';

export const DELETE_ACCOUNT_PATH = ['/you', 'settings', 'delete-account'];
const CONFIRM_WORD = 'DELETE';

const WHAT_IS_ERASED: readonly string[] = [
  'Your profile and plan',
  'Workouts and personal bests',
  'Food, water and check-ins',
  'Weight, measurements and InBody records',
  'Reminders',
];

/**
 * Deleting the account (Google Play requires it in the app): signed in, the account and everything the server holds
 * for it are deleted, then the data on this phone; signed out, only this phone's data is erased. Both are
 * permanent, so the person types DELETE first. Afterwards the app starts afresh (setup).
 */
@Component({
  selector: 'app-delete-account',
  template: `
    <ion-content>
      <main class="body">
        <div class="topbar">
          <ion-back-button class="back" defaultHref="/you/settings" text="" icon="chevron-back" aria-label="Back to Settings" />
          <h1 class="title">{{ signedIn() ? 'Delete account' : 'Erase data' }}</h1>
        </div>

        <section class="card warning" aria-labelledby="delete-what">
          <span class="warning-icon" aria-hidden="true"><ion-icon name="warning-outline" /></span>
          <h2 id="delete-what" class="card-title">This can't be undone</h2>
          @if (signedIn()) {
            <p class="text">
              Your StokeForm account <strong>{{ email() }}</strong> will be deleted: your sign-in, your name and email, and anything kept on our server.
              Everything StokeForm keeps on this phone is erased too:
            </p>
          } @else {
            <p class="text">Everything StokeForm keeps on this phone will be erased:</p>
          }
          <ul class="list">
            @for (item of erased; track item) {
              <li><ion-icon name="close-circle-outline" aria-hidden="true" />{{ item }}</li>
            }
          </ul>
          <p class="hint">Uninstalling the app also erases the data on this phone, but it doesn't delete your account.</p>
        </section>

        <form class="card" novalidate (submit)="$event.preventDefault(); confirm()">
          <fit-text-field
            [label]="'Type ' + word + ' to confirm'"
            autocomplete="off"
            enterKeyHint="done"
            [maxLength]="12"
            [value]="typed()"
            (valueChange)="typed.set($event); error.set(null)"
            [error]="error()"
            [invalid]="!!error()"
            data-testid="delete-confirm-input"
          />
          <button fit-button type="submit" variant="danger" size="lg" block data-testid="delete-confirm" [disabled]="!ready() || busy()" [loading]="busy()">
            {{ signedIn() ? 'Delete my account' : 'Erase all data' }}
          </button>
        </form>

        <p class="hint center">Need help? Email <a [href]="'mailto:' + support">{{ support }}</a>.</p>
      </main>
    </ion-content>
  `,
  styles: `
    @use 'mixins' as fx;

    ion-content {
      --background: var(--color-bg);
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: var(--page-max-width);
      margin: 0 auto;
      padding: calc(var(--ion-safe-area-top, 0px) + var(--space-2)) var(--space-4) var(--space-10);
    }

    .topbar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .back {
      --background: var(--color-surface);
      --border-radius: var(--radius-pill);
      --color: var(--color-text);
      --icon-font-size: 22px;
      --padding-start: 0;
      --padding-end: 0;
      --icon-margin-start: 0;
      --icon-margin-end: 0;

      display: block;
      width: 44px;
      height: 44px;
    }

    .title {
      @include fx.text(h1, bold);
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }

    .warning-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
      color: var(--color-danger-text);
      font-size: 24px;
    }

    .card-title {
      @include fx.text(h3, bold);
    }

    .text {
      @include fx.text(body);
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        @include fx.text(body-sm);
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      ion-icon {
        flex: none;
        color: var(--color-danger-text);
        font-size: 18px;
      }
    }

    .hint {
      @include fx.text(body-sm);
      color: var(--color-text-secondary);

      a {
        color: var(--color-primary-text);
        font-weight: var(--font-weight-semibold);
      }
    }

    .center {
      text-align: center;
    }
  `,
  host: { class: 'fit-theme-dashboard' },
  imports: [IonBackButton, IonContent, IonIcon, FitnessButtonComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccountPage {
  private readonly auth = inject(AuthService);
  private readonly accountData = inject(AccountDataService);

  protected readonly word = CONFIRM_WORD;
  protected readonly erased = WHAT_IS_ERASED;
  protected readonly support = SUPPORT_EMAIL;
  protected readonly signedIn = computed(() => this.auth.state().status === 'signed-in');
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly typed = signal('');
  protected readonly ready = computed(() => this.typed().trim() === CONFIRM_WORD);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async confirm(): Promise<void> {
    if (!this.ready() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      if (!this.signedIn()) {
        await this.accountData.eraseAndRestart();
        return;
      }
      const result = await this.accountData.deleteAccount();
      if (!result.ok) {
        this.error.set(messageFor(result.error));
      }
    } finally {
      this.busy.set(false);
    }
  }
}

function messageFor(error: AuthError): string {
  switch (error) {
    case 'network':
      return "You're offline. Connect to the internet and try again.";
    case 'invalid-credentials':
      return 'Your session has ended. Sign in again, then delete your account.';
    default:
      return `Your account couldn't be deleted right now. Try again, or email ${SUPPORT_EMAIL}.`;
  }
}
