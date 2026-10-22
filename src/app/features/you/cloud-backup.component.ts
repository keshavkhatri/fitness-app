import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';
import { BottomSheetComponent, FitnessButtonComponent } from '../../shared/ui';

const minutesAgo = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));

/**
 * Settings › Cloud backup: opt-in (it copies health and fitness data to StokeForm's server, so the person agrees
 * here, in so many words). On: when it last backed up, "Back up now", and turning it off (which deletes the cloud
 * copy). The first time, if the account already has a backup and this phone has data, the person picks which to keep.
 */
@Component({
  selector: 'app-cloud-backup',
  template: `
    @if (sync.available) {
      <section class="card" aria-labelledby="settings-backup" data-testid="cloud-backup">
        <div class="head">
          <span class="icon" [class.on]="sync.enabled()" aria-hidden="true"><ion-icon name="cloud-upload-outline" /></span>
          <div>
            <h2 class="setting-title" id="settings-backup">Cloud backup</h2>
            <p class="status" data-testid="cloud-backup-status" role="status">{{ statusText() }}</p>
          </div>
        </div>

        @if (!signedIn()) {
          <p class="hint">Sign in to back up your data and restore it on a new phone.</p>
        } @else if (sync.enabled()) {
          <p class="hint">Changes are backed up automatically, encrypted, and follow you to your other phones.</p>
          <div class="actions">
            <button fit-button type="button" variant="secondary" data-testid="cloud-backup-now" [disabled]="sync.status() === 'syncing'" (click)="backUpNow()">Back up now</button>
            <button fit-button type="button" variant="ghost-danger" data-testid="cloud-backup-off" (click)="confirmOff.set(true)">Turn off</button>
          </div>
        } @else {
          <p class="hint">
            Copies your profile, plan, workouts, food, water, weight, measurements and InBody records to StokeForm's server,
            encrypted, so you don't lose them with your phone and can restore them on a new one. You can turn it off any
            time, which deletes the copy.
          </p>
          @if (sync.status() === 'under-age') {
            <p class="error" role="alert">Cloud backup is only for people aged 18 and over.</p>
          }
          <button fit-button type="button" block data-testid="cloud-backup-on" [loading]="busy()" [disabled]="busy()" (click)="turnOn()">Turn on cloud backup</button>
          @if (failed()) {
            <p class="error" role="alert">Couldn't turn on backup. Check your connection and try again.</p>
          }
        }
      </section>

      <fit-bottom-sheet title="You already have a backup" description="This account has data in the cloud, and this phone has data too. Which do you want to keep?" screenTheme="dashboard" [(open)]="choosing">
        <div class="choices">
          <button fit-button type="button" block data-testid="cloud-backup-keep-cloud" [disabled]="busy()" (click)="turnOn('cloud')">Use the backup (replaces this phone's data)</button>
          <button fit-button type="button" variant="secondary" block data-testid="cloud-backup-keep-phone" [disabled]="busy()" (click)="turnOn('phone')">Keep this phone's data (replaces the backup)</button>
        </div>
      </fit-bottom-sheet>

      <fit-bottom-sheet title="Turn off cloud backup?" description="The copy on StokeForm's server is deleted. Your data stays on this phone." screenTheme="dashboard" [(open)]="confirmOff">
        <div class="choices">
          <button fit-button type="button" variant="danger" block data-testid="cloud-backup-off-confirm" [disabled]="busy()" (click)="turnOff()">Turn off and delete the backup</button>
          <button fit-button type="button" variant="ghost" block (click)="confirmOff.set(false)">Keep backup on</button>
          @if (failed()) {
            <p class="error" role="alert">Couldn't reach the server. Try again when you're online.</p>
          }
        </div>
      </fit-bottom-sheet>
    }
  `,
  styles: `
    @use 'mixins' as fx;

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }

    .head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      font-size: 22px;

      &.on {
        background: var(--color-primary-soft);
        color: var(--color-primary-text);
      }
    }

    .setting-title {
      @include fx.text(body-sm, semibold);
    }

    .status {
      @include fx.text(caption);
      color: var(--color-text-secondary);
    }

    .hint {
      @include fx.text(body-sm);
      color: var(--color-text-secondary);
    }

    .error {
      @include fx.text(body-sm, medium);
      color: var(--color-danger-text);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .choices {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-bottom: var(--space-2);
    }
  `,
  imports: [IonIcon, BottomSheetComponent, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloudBackupComponent {
  protected readonly sync = inject(SyncService);
  private readonly auth = inject(AuthService);

  protected readonly signedIn = computed(() => this.auth.state().status === 'signed-in');
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly choosing = signal(false);
  protected readonly confirmOff = signal(false);

  protected readonly statusText = computed(() => {
    if (!this.signedIn() || !this.sync.enabled()) {
      return 'Off';
    }
    switch (this.sync.status()) {
      case 'syncing':
        return 'Backing up…';
      case 'offline':
        return "Offline: it backs up when you're online";
      case 'error':
        return "Couldn't back up. It tries again shortly";
      default: {
        const at = this.sync.lastSyncedAt();
        if (!at) {
          return 'On';
        }
        const m = minutesAgo(at, Date.now());
        return m < 1 ? 'Backed up just now' : m < 60 ? `Backed up ${m} min ago` : `Backed up ${new Date(at).toLocaleString()}`;
      }
    }
  });

  protected async turnOn(keep?: 'phone' | 'cloud'): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      const result = await this.sync.enable(keep);
      if (result === 'needs-choice') {
        this.choosing.set(true);
        return;
      }
      this.choosing.set(false);
      this.failed.set(result === 'failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected backUpNow(): void {
    void this.sync.sync();
  }

  protected async turnOff(): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      if (await this.sync.disable()) {
        this.confirmOff.set(false);
      } else {
        this.failed.set(true);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
