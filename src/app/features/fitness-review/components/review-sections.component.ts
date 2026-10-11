import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../shared/ui';
import { FITNESS_REVIEW_COPY } from '../fitness-review-content';
import { ActionView, BodyView, NutritionView, ReviewLink, TrainingView } from '../fitness-review-view-model';

/** The prioritised actions, each with the data that selected it. */
@Component({
  selector: 'app-review-actions',
  template: `
    <section class="section" aria-labelledby="review-actions-title" data-testid="review-actions">
      <h2 class="section-title" id="review-actions-title">{{ title() }}</h2>
      <fit-card>
        @if (actions().length) {
          <ol class="list">
            @for (a of actions(); track a.id; let i = $index) {
              <li class="action" [attr.data-testid]="'action-' + a.id">
                <span class="action-rank" aria-hidden="true">{{ i + 1 }}</span>
                <div class="action-body">
                  <p class="item-title">{{ a.title }}</p>&ngsp;
                  <p class="item-detail">{{ a.reason }}</p>&ngsp;
                  <button type="button" class="link" (click)="open.emit(a.link.target)">
                    {{ a.link.label }}<ion-icon name="chevron-forward" aria-hidden="true" />
                  </button>
                </div>
              </li>
            }
          </ol>
        } @else {
          <p class="text" data-testid="no-actions">{{ copy.actions.none }}</p>
        }
      </fit-card>
    </section>
  `,
  styleUrl: './review-section.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewActionsComponent {
  readonly title = input.required<string>();
  readonly actions = input.required<readonly ActionView[]>();
  readonly open = output<ReviewLink>();
  protected readonly copy = FITNESS_REVIEW_COPY;
}

/** Workouts finished, improving and stalled exercises (comparable sessions only). */
@Component({
  selector: 'app-review-training',
  template: `
    @let t = training();
    <section class="section" aria-labelledby="review-training-title" data-testid="review-training">
      <h2 class="section-title" id="review-training-title">{{ copy.training.title }}</h2>
      <fit-card>
        <div class="section">
          @if (t.kind === 'ready') {
            <p class="text" data-testid="training-summary">{{ t.summary }}</p>
            @if (t.improving.length) {
              <h3 class="group-title">{{ copy.training.improving }}</h3>
              <ul class="list" data-testid="improving">
                @for (x of t.improving; track x.exerciseId) {
                  <li class="item">
                    <button type="button" class="link item-title" (click)="open.emit({ kind: 'exercise', exerciseId: x.exerciseId })">{{ x.name }}</button>&ngsp;
                    <span class="item-detail">{{ x.detail }}</span>
                  </li>
                }
              </ul>
            }
            @if (t.stalled.length) {
              <h3 class="group-title">{{ copy.training.stalled }}</h3>
              <ul class="list" data-testid="stalled">
                @for (x of t.stalled; track x.exerciseId) {
                  <li class="item">
                    <button type="button" class="link item-title" (click)="open.emit({ kind: 'exercise', exerciseId: x.exerciseId })">{{ x.name }}</button>&ngsp;
                    <span class="item-detail">{{ x.detail }}</span>
                  </li>
                }
              </ul>
            }
            @if (t.notEnough; as note) {
              <p class="note" data-testid="not-enough">{{ note }}</p>
            }
            @if (t.showRule) {
              <p class="note">{{ copy.training.rule }}</p>
            }
          } @else {
            <p class="note">{{ copy.training.unavailable }}</p>
          }
          <button type="button" class="link" (click)="open.emit({ kind: 'workout' })">
            {{ copy.links.workout }}<ion-icon name="chevron-forward" aria-hidden="true" />
          </button>
        </div>
      </fit-card>
    </section>
  `,
  styleUrl: './review-section.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewTrainingComponent {
  readonly training = input.required<TrainingView>();
  readonly open = output<ReviewLink>();
  protected readonly copy = FITNESS_REVIEW_COPY;
}

/** Logging coverage and daily averages over logged days, against valid targets only. */
@Component({
  selector: 'app-review-nutrition',
  template: `
    @let n = nutrition();
    <section class="section" aria-labelledby="review-nutrition-title" data-testid="review-nutrition">
      <h2 class="section-title" id="review-nutrition-title">{{ copy.nutrition.title }}</h2>
      <fit-card>
        <div class="section">
          @switch (n.kind) {
            @case ('ready') {
              <p class="text" data-testid="nutrition-coverage">{{ n.coverage }}</p>
              @for (r of n.rows; track r.key) {
                <div class="row" [attr.data-testid]="'nutrition-' + r.key">
                  <span class="item-title">{{ r.label }}</span>&ngsp;
                  <span class="item">
                    <span class="row-value">{{ r.value }}</span>
                    @if (r.target; as target) {
                      &ngsp;<span class="item-detail row-value">{{ target }}</span>
                    }
                  </span>
                </div>
              }
              @if (n.targetNote; as note) {
                <p class="note" data-testid="nutrition-target-note">{{ note }}</p>
              }
              <p class="note">{{ copy.nutrition.averageNote }}</p>
              <button type="button" class="link" (click)="open.emit(n.link.target)">
                {{ n.link.label }}<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            }
            @case ('empty') {
              <p class="text" data-testid="nutrition-coverage">{{ n.coverage }}</p>
              <p class="note">{{ copy.nutrition.none }}</p>
              <button type="button" class="link" (click)="open.emit({ kind: 'nutrition' })">
                {{ copy.links.nutrition }}<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            }
            @default {
              <p class="note">{{ copy.nutrition.unavailable }}</p>
            }
          }
        </div>
      </fit-card>
    </section>
  `,
  styleUrl: './review-section.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewNutritionComponent {
  readonly nutrition = input.required<NutritionView>();
  readonly open = output<ReviewLink>();
  protected readonly copy = FITNESS_REVIEW_COPY;
}

/** Weight trend, tape measurements and InBody report changes, with what they can and can't show. */
@Component({
  selector: 'app-review-body',
  template: `
    @let b = body();
    <section class="section" aria-labelledby="review-body-title" data-testid="review-body">
      <h2 class="section-title" id="review-body-title">{{ copy.body.title }}</h2>
      <fit-card>
        <div class="section">
          <h3 class="group-title">{{ copy.body.weight }}</h3>
          @if (b.weight.kind === 'ready') {
            <div class="item" data-testid="body-weight">
              <p class="item-title">{{ b.weight.text }}</p>
              @if (b.weight.detail; as detail) {
                &ngsp;<p class="item-detail">{{ detail }}</p>
              }
            </div>
            <p class="note">{{ copy.body.weightNote }}</p>
          } @else {
            <p class="note">{{ copy.body.unavailable }}</p>
          }
          <button type="button" class="link" (click)="open.emit({ kind: 'weight-history' })">
            {{ copy.links.weightHistory }}<ion-icon name="chevron-forward" aria-hidden="true" />
          </button>

          <hr class="divider" />
          <h3 class="group-title">{{ copy.body.measurements }}</h3>
          @if (b.measurements.kind === 'ready') {
            @if (b.measurements.items.length) {
              <ul class="list" data-testid="body-measurements">
                @for (m of b.measurements.items; track m.key) {
                  <li class="row">
                    <span class="item"><span class="item-title">{{ m.label }}</span>&ngsp;<span class="item-detail">{{ m.detail }}</span></span>&ngsp;
                    <span class="row-value">{{ m.value }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="note" data-testid="body-measurements-none">{{ copy.body.measurementsNone }}</p>
            }
          } @else {
            <p class="note">{{ copy.body.unavailable }}</p>
          }
          <button type="button" class="link" (click)="open.emit({ kind: 'measurements' })">
            {{ copy.links.measurements }}<ion-icon name="chevron-forward" aria-hidden="true" />
          </button>

          <hr class="divider" />
          <h3 class="group-title">{{ copy.body.composition }}</h3>
          @if (b.composition.kind === 'ready') {
            @if (b.composition.items.length) {
              <p class="note">{{ copy.body.compositionMeasured }}</p>
              <ul class="list" data-testid="body-composition">
                @for (c of b.composition.items; track c.key) {
                  <li class="row">
                    <span class="item"><span class="item-title">{{ c.label }}</span>&ngsp;<span class="item-detail">{{ c.detail }}</span></span>&ngsp;
                    <span class="row-value">{{ c.value }}</span>
                  </li>
                }
              </ul>
              <p class="note">{{ copy.body.compositionNote }}</p>
            } @else {
              <p class="note" data-testid="body-composition-none">{{ copy.body.compositionNone }}</p>
            }
          } @else {
            <p class="note">{{ copy.body.unavailable }}</p>
          }
          <button type="button" class="link" (click)="open.emit({ kind: 'body-composition' })">
            {{ copy.links.composition }}<ion-icon name="chevron-forward" aria-hidden="true" />
          </button>
        </div>
      </fit-card>
    </section>
  `,
  styleUrl: './review-section.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewBodyComponent {
  readonly body = input.required<BodyView>();
  readonly open = output<ReviewLink>();
  protected readonly copy = FITNESS_REVIEW_COPY;
}
