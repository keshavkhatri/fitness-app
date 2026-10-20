import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent } from '../../../shared/ui';
import { OFFER_COPY } from '../offer-content';

/** After a promo code works (dark): test access is on, and it is plainly not a subscription. */
@Component({
  selector: 'app-promo-success',
  template: `
    <main class="success" data-testid="promo-success">
      <div class="burst" aria-hidden="true">
        @for (spark of sparks; track $index) {
          <span class="spark" [style.rotate.deg]="spark"></span>
        }
        <span class="ring"><ion-icon name="checkmark" /></span>
      </div>
      <h1 class="title" data-testid="offer-title">{{ copy.title }}</h1>
      <p class="lead">{{ copy.lead }}</p>

      <section class="card test" aria-labelledby="promo-test-title">
        <span class="badge">{{ copy.badge }}</span>
        <div class="row">
          <span class="icon" aria-hidden="true"><ion-icon name="barbell-outline" /></span>
          <div>
            <p class="name" id="promo-test-title">{{ copy.planName }}</p>
            <p class="line">{{ copy.notSubscription }}</p>
          </div>
        </div>
        <button fit-button type="button" variant="ink" block data-testid="offer-test-off" (click)="turnOff.emit()">{{ copy.turnOff }}</button>
      </section>

      <section class="card" aria-labelledby="promo-plan-title">
        <h2 class="card-title" id="promo-plan-title">{{ copy.yourPlan }}</h2>
        <div class="row">
          <span class="icon" aria-hidden="true"><ion-icon name="barbell-outline" /></span>
          <div>
            <p class="name">Pro</p>
            <p class="line">{{ copy.planLine }}</p>
          </div>
        </div>
      </section>
    </main>
  `,
  styles: `
    @use 'mixins' as fx;

    .success {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-height: 100%;
      padding: calc(var(--ion-safe-area-top, 0px) + var(--space-8)) var(--space-4) var(--space-6);
      background: var(--color-ink);
      color: var(--color-on-ink);
      text-align: center;
    }

    .burst {
      position: relative;
      display: grid;
      place-items: center;
      height: 132px;
    }

    .spark {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 3px;
      height: 10px;
      margin: -5px 0 0 -1.5px;
      border-radius: 2px;
      background: var(--color-ink-accent);
      transform: translateY(-62px);
      transform-origin: 50% 5px;
    }

    .ring {
      display: grid;
      place-items: center;
      width: 92px;
      height: 92px;
      border: 3px solid var(--color-ink-accent);
      border-radius: var(--radius-pill);
      color: var(--color-ink-accent);
      font-size: 46px;
    }

    .title {
      @include fx.text(h2, bold);
      margin: 0;
    }

    .lead {
      @include fx.text(body-sm);
      margin: 0;
      color: var(--color-on-ink-secondary);
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-card);
      background: var(--color-surface);
      color: var(--color-text);
      text-align: start;
    }

    .test {
      position: relative;
      margin-top: var(--space-3);
    }

    .badge {
      @include fx.text(caption, bold);
      position: absolute;
      top: -12px;
      left: var(--space-4);
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--color-ink-accent);
      color: var(--color-ink);
      text-transform: uppercase;
    }

    .card-title,
    .name {
      @include fx.text(body-sm, semibold);
      margin: 0;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-primary-text);
      font-size: 20px;
    }

    .line {
      @include fx.text(caption);
      margin: 0;
      color: var(--color-text-secondary);
    }
  `,
  imports: [IonIcon, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromoSuccessComponent {
  readonly turnOff = output<void>();
  protected readonly copy = OFFER_COPY.success;
  protected readonly sparks = [0, 45, 90, 135, 180, 225, 270, 315];
}
