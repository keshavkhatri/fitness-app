import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FitnessCardComponent, NoticeComponent } from '../../../shared/ui';
import { MacrosViewModel } from '../assessment-view-model';

/** Gram targets, or (when unavailable) only an explanation, never invented numbers. */
@Component({
  selector: 'app-macro-summary',
  template: `
    @let m = macros();
    @if (m.kind === 'grams') {
      @if (m.notice; as notice) {
        <fit-notice [tone]="notice.tone" [title]="notice.title" data-testid="macro-notice">{{ notice.message }}</fit-notice>
      }
      <fit-card padding="none">
        <dl class="rows" data-testid="macro-grams">
          @for (row of m.rows; track row.key) {
            <div class="row">
              <dt class="label">
                {{ row.label }}
                <span class="share">{{ row.share }}</span>
              </dt>
              <dd class="grams">{{ row.grams }}</dd>
            </div>
          }
        </dl>
      </fit-card>
    } @else {
      <fit-notice [tone]="m.notice.tone" [title]="m.notice.title" data-testid="macros-unavailable">
        {{ m.notice.message }}
      </fit-notice>
    }
  `,
  styleUrl: './macro-summary.component.scss',
  imports: [FitnessCardComponent, NoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroSummaryComponent {
  readonly macros = input.required<MacrosViewModel>();
}
