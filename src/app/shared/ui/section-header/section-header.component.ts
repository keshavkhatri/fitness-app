import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Heading row for a page section, with an optional projected trailing action.
 * Pass `headingId` and reference it from the section's `aria-labelledby`.
 */
@Component({
  selector: 'fit-section-header',
  template: `
    <h2 class="title" [attr.id]="headingId()">{{ title() }}</h2>
    <ng-content />
  `,
  styleUrl: './section-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeaderComponent {
  readonly title = input.required<string>();
  readonly headingId = input<string>();
}
