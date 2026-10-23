import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { HealthStepsService } from '../../core/health/health-steps.service';
import { FitnessButtonComponent } from '../../shared/ui';

const timeText = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Settings › Step counting: count steps automatically from the phone through Health Connect (Android 14+), instead
 * of typing them. The app only reads the step count, and only after the system's permission dialog; it never writes
 * anything to Health Connect. Shown in the Android app only.
 */
@Component({
  selector: 'app-health-steps-card',
  template: `
    @if (health.supported) {
      <section class="card" aria-labelledby="settings-health" data-testid="health-steps">
        <div class="head">
          <span class="icon" [class.on]="health.state() === 'connected'" aria-hidden="true"><ion-icon name="walk-outline" /></span>
          <div>
            <h2 class="setting-title" id="settings-health">Step counting</h2>
            <p class="status" role="status" data-testid="health-steps-status">{{ statusText() }}</p>
          </div>
        </div>

        @switch (health.state()) {
          @case ('unsupported') {
            <p class="hint">Automatic step counting needs Health Connect, which comes with Android 14 and newer. On this phone, type your steps in from Home.</p>
          }
          @case ('off') {
            <p class="hint">
              Count your steps automatically from your phone, through Health Connect, instead of typing them. StokeForm only reads your step count. It never changes anything in Health Connect.
            </p>
            <button fit-button type="button" block data-testid="health-steps-connect" [loading]="health.busy()" [disabled]="health.busy()" (click)="connect()">Connect Health Connect</button>
          }
          @case ('connected') {
            <p class="hint">A day's steps from your phone replace a typed number for that day. Days with no steps from the phone keep what you typed.</p>
            @if (health.failed()) {
              <p class="error" role="alert">Couldn't read your steps from Health Connect. It tries again next time you open the app.</p>
            }
            <div class="actions">
              <button fit-button type="button" variant="secondary" data-testid="health-steps-sync" [disabled]="health.busy()" (click)="syncNow()">Update now</button>
              <button fit-button type="button" variant="ghost" data-testid="health-steps-off" (click)="health.disconnect()">Turn off</button>
            </div>
          }
          @case ('needs-permission') {
            <p class="hint">StokeForm can't read your steps yet. Allow "Steps" for StokeForm in Health Connect.</p>
            <div class="actions">
              <button fit-button type="button" data-testid="health-steps-allow" [loading]="health.busy()" [disabled]="health.busy()" (click)="connect()">Allow steps</button>
              <button fit-button type="button" variant="secondary" data-testid="health-steps-settings" (click)="health.openSettings()">Open Health Connect</button>
              <button fit-button type="button" variant="ghost" data-testid="health-steps-off" (click)="health.disconnect()">Turn off</button>
            </div>
          }
        }
      </section>
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
  `,
  imports: [IonIcon, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthStepsCardComponent {
  protected readonly health = inject(HealthStepsService);

  protected readonly statusText = computed(() => {
    switch (this.health.state()) {
      case 'connected': {
        const at = this.health.lastSyncedAt();
        return at ? `On. Updated ${timeText(at)}` : 'On';
      }
      case 'needs-permission':
        return 'Permission needed';
      case 'unsupported':
        return 'Not available on this phone';
      default:
        return 'Off. You type your steps in';
    }
  });

  constructor() {
    void this.health.load();
  }

  protected async connect(): Promise<void> {
    await this.health.connect();
  }

  protected async syncNow(): Promise<void> {
    await this.health.sync();
  }
}
