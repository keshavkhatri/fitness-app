import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal } from '@angular/core';

/** A random order of `items` (Fisher–Yates), without touching the input. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * A full-screen "working on it" overlay for a long wait (reading a report): a
 * dimmed, blurred backdrop, a report sheet with a scanning line, and messages
 * that change every couple of seconds in a random order, ending on
 * `closingMessage` (which then stays). It blocks the screen behind it, so a
 * Cancel button is always offered and takes focus.
 *
 * The messages are decoration (hidden from assistive technology); the dialog
 * is named by `title`, and `title` is announced once through a polite live
 * region, not every time a message changes. With reduced motion nothing
 * moves: the scan line and glow stand still and messages swap without fading.
 */
@Component({
  selector: 'fit-analysis-overlay',
  template: `
    <div class="overlay" role="dialog" aria-modal="true" [attr.aria-label]="title()" data-testid="analysis-overlay">
      <p class="visually-hidden" role="status" aria-live="polite">{{ title() }}</p>
      <div class="stage" aria-hidden="true">
        <span class="glow"></span>
        <span class="sheet">
          <span class="brand"></span>
          <span class="line w80"></span>
          <span class="line w60"></span>
          <span class="bars"><span></span><span></span><span></span></span>
          <span class="line w70"></span>
          <span class="line w50"></span>
          <span class="scan"></span>
        </span>
      </div>
      <div class="copy">
        <p class="message" aria-hidden="true" data-testid="analysis-message">
          @for (message of [current()]; track message) {
            <span class="swap">{{ message }}</span>
          }
        </p>
        @if (hint(); as text) {
          <p class="hint">{{ text }}</p>
        }
      </div>
      <button type="button" class="cancel" data-testid="analysis-cancel" (click)="cancelled.emit()">{{ cancelLabel() }}</button>
    </div>
  `,
  styleUrl: './analysis-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisOverlayComponent {
  /** Names the dialog and is announced once. */
  readonly title = input.required<string>();
  /** Shown in a random order, one at a time. */
  readonly messages = input.required<readonly string[]>();
  /** Shown last, and kept on screen until the overlay goes away. */
  readonly closingMessage = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly cancelLabel = input('Cancel');
  /** Milliseconds each message stays. */
  readonly interval = input(2600);
  /** Turn off the shuffle (tests). */
  readonly shuffle = input(true);

  readonly cancelled = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly step = signal(0);
  /** The running order: the messages in a random order (fixed while the overlay is up), then the closing message. */
  private readonly order = computed(() => {
    const messages = this.messages();
    const closing = this.closingMessage();
    return [...(this.shuffle() ? shuffled(messages) : messages), ...(closing ? [closing] : [])];
  });
  protected readonly current = computed(() => {
    const order = this.order();
    return order[Math.min(this.step(), order.length - 1)] ?? '';
  });

  constructor() {
    effect((onCleanup) => {
      const last = this.order().length - 1;
      const timer = setInterval(() => this.step.update((s) => Math.min(s + 1, last)), this.interval());
      onCleanup(() => clearInterval(timer));
    });
    afterNextRender(() => {
      // Lifted to <body>: inside the page it would sit under the tab bar, which would stay visible and tappable.
      document.body.appendChild(this.host.nativeElement);
      // The screen behind is blocked, so keyboard focus must not stay on it.
      this.host.nativeElement.querySelector<HTMLButtonElement>('.cancel')?.focus({ preventScroll: true });
    });
    inject(DestroyRef).onDestroy(() => this.host.nativeElement.remove());
  }
}
