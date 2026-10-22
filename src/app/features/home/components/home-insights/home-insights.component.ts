import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { InsightAction, InsightCard } from '../../home-insights';

/**
 * The dashboard's extra cards (goal or next milestone, new personal bests, what's coming up, body composition,
 * this week's volume, a weigh-in nudge, a form tip). Only cards with something real to say are given. A card with
 * a destination is one button; the tip has none. Presentational only.
 */
@Component({
  selector: 'app-home-insights',
  template: `
    <ul class="insights" data-testid="home-insights">
      @for (card of cards(); track card.kind) {
        <li class="insight" [attr.data-kind]="card.kind" [class.wide]="wide(card)">
          @switch (card.kind) {
            @case ('goal-weight') {
              <button type="button" class="face" data-testid="insight-goal-weight" (click)="act.emit(card.action)">
                <span class="eyebrow"><ion-icon name="flag-outline" aria-hidden="true" />Goal weight</span>
                <span class="goal-row">
                  <span class="big">{{ card.latest }}</span>
                  <ion-icon class="arrow" name="arrow-forward" aria-hidden="true" />
                  <span class="target">{{ card.target }}</span>
                </span>
                <span class="track" aria-hidden="true"><span class="fill" [style.width.%]="card.progress * 100"></span></span>
                <span class="caption">{{ card.remaining }}</span>
              </button>
            }
            @case ('streak-milestone') {
              <button type="button" class="face" data-testid="insight-streak" (click)="act.emit(card.action)">
                <span class="eyebrow"><span aria-hidden="true">🔥</span>Next milestone</span>
                <span class="big">{{ card.next - card.current }} {{ card.next - card.current === 1 ? 'day' : 'days' }}</span>
                <span class="caption">to a {{ card.next }}-day streak</span>
                <span class="track" aria-hidden="true"><span class="fill streak" [style.width.%]="(card.current / card.next) * 100"></span></span>
              </button>
            }
            @case ('personal-bests') {
              <button type="button" class="face" data-testid="insight-bests" (click)="act.emit(card.action)">
                <span class="eyebrow"><span aria-hidden="true">🏆</span>New bests this week</span>
                <span class="rows">
                  @for (item of card.items; track item.exercise) {
                    <span class="row"><span class="row-title">{{ item.exercise }}</span>&ngsp;<span class="row-value">{{ item.set }}</span></span>
                  }
                </span>
              </button>
            }
            @case ('upcoming') {
              <div class="face plain" data-testid="insight-upcoming">
                <span class="eyebrow"><ion-icon name="calendar-outline" aria-hidden="true" />Coming up</span>
                <span class="rows">
                  @for (item of card.items; track item.sessionId) {
                    <button type="button" class="row link" (click)="act.emit({ kind: 'session', sessionId: item.sessionId })">
                      <span class="row-day">{{ item.weekday }}</span>&ngsp;
                      <span class="row-title">{{ item.title }}</span>&ngsp;
                      <span class="row-value">{{ item.detail }}</span>
                      <ion-icon name="chevron-forward" aria-hidden="true" />
                    </button>
                  }
                </span>
              </div>
            }
            @case ('body') {
              <button type="button" class="face" data-testid="insight-body" (click)="act.emit(card.action)">
                <span class="eyebrow"><ion-icon name="body-outline" aria-hidden="true" />Body composition</span>
                @for (item of card.items; track item.label) {
                  <span class="stat">
                    <span class="stat-label">{{ item.label }}</span>&ngsp;
                    <span class="stat-value">{{ item.value }}</span>&ngsp;
                    @if (item.change) {
                      <span class="change" [attr.data-direction]="item.direction">{{ item.change }}</span>
                    }
                  </span>
                }
                @if (card.since) {
                  <span class="caption">{{ card.since }}</span>
                }
              </button>
            }
            @case ('volume') {
              <button type="button" class="face" data-testid="insight-volume" (click)="act.emit(card.action)">
                <span class="eyebrow"><ion-icon name="barbell-outline" aria-hidden="true" />Volume this week</span>
                <span class="big">{{ card.thisWeek }}</span>
                @if (card.change) {
                  <span class="change" [attr.data-direction]="card.direction">{{ card.change }}</span>
                } @else {
                  <span class="caption">Weight × reps, all sets</span>
                }
              </button>
            }
            @case ('weigh-in') {
              <button type="button" class="face nudge" data-testid="insight-weigh-in" (click)="act.emit(card.action)">
                <span class="eyebrow"><ion-icon name="scale-outline" aria-hidden="true" />Time to weigh in</span>
                <span class="caption">{{ card.daysSince === null ? 'No weigh-in yet' : 'Last one ' + card.daysSince + ' days ago' }}</span>
                <span class="pill">Log weight<ion-icon name="add" aria-hidden="true" /></span>
              </button>
            }
            @case ('tip') {
              <div class="face plain tip" data-testid="insight-tip">
                <span class="eyebrow"><ion-icon name="bulb-outline" aria-hidden="true" />Form tip · {{ card.exercise }}</span>
                <span class="tip-cue">{{ card.cue }}</span>
                <span class="caption">{{ card.breathing }}</span>
              </div>
            }
          }
        </li>
      }
    </ul>
  `,
  styleUrl: './home-insights.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeInsightsComponent {
  readonly cards = input.required<readonly InsightCard[]>();
  readonly act = output<InsightAction>();

  /** Lists and sentences take the full row; single figures share it. */
  protected wide(card: InsightCard): boolean {
    return card.kind === 'goal-weight' || card.kind === 'personal-bests' || card.kind === 'upcoming' || card.kind === 'tip' || card.kind === 'body';
  }
}
