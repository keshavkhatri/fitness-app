import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

/**
 * Standard top-level page chrome: a large page title in the content that,
 * once scrolled away, is replaced by a compact title in the toolbar. Page
 * content is projected into a padded, width-constrained body.
 *
 * Implemented without Ionic's iOS-only `collapse="condense"` header so it
 * looks and behaves the same in `ios` and `md` modes.
 *
 * Use as the root element of a routed page template:
 *   <fit-page title="Workout">…</fit-page>
 */
@Component({
  selector: 'fit-page',
  template: `
    <ion-header class="ion-no-border" [class.scrolled]="isScrolled()">
      <ion-toolbar>
        <!-- Duplicate of the <h1> below; hidden from assistive tech. -->
        <ion-title aria-hidden="true">{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <h1 #largeTitle class="large-title">{{ title() }}</h1>
      <div class="page-body">
        <ng-content />
      </div>
    </ion-content>
  `,
  styleUrl: './page-layout.component.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageLayoutComponent {
  readonly title = input.required<string>();

  /** True once the large title has scrolled out of view. */
  protected readonly isScrolled = signal(false);

  private readonly content = viewChild.required(IonContent);
  private readonly largeTitle = viewChild.required<ElementRef<HTMLElement>>('largeTitle');

  constructor() {
    let observer: IntersectionObserver | undefined;
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      observer?.disconnect();
    });

    afterNextRender(async () => {
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }
      const scrollRoot = await this.content().getScrollElement();
      if (destroyed) {
        return;
      }
      observer = new IntersectionObserver(([entry]) => this.isScrolled.set(!entry.isIntersecting), {
        root: scrollRoot,
      });
      observer.observe(this.largeTitle().nativeElement);
    });
  }
}
