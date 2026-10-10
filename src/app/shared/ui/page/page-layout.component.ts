import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IonContent, IonHeader, IonRefresher, IonRefresherContent, IonTitle, IonToolbar } from '@ionic/angular';

/** Emitted by a refreshable page; call `complete()` once every reload has settled. */
export interface PageRefreshEvent {
  complete(): void;
}

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
 *
 * Optional: `heading` replaces the large title text (the toolbar keeps
 * `title`), `kicker` adds a line above it (e.g. the date), `refreshable`
 * adds pull to refresh (`refresh` output) and `wide` lifts the phone max
 * width for pages that lay out in columns on tablets.
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
      @if (refreshable()) {
        <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
          <ion-refresher-content [refreshingText]="refreshingText()" />
        </ion-refresher>
      }
      <div class="large-title-block" [class.wide]="wide()">
        @if (kicker(); as k) {
          <p class="kicker">{{ k }}</p>
        }
        <h1 #largeTitle class="large-title">{{ heading() ?? title() }}</h1>
      </div>
      <div class="page-body" [class.wide]="wide()">
        <ng-content />
      </div>
    </ion-content>
  `,
  styleUrl: './page-layout.component.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonRefresher, IonRefresherContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageLayoutComponent {
  readonly title = input.required<string>();
  /** Large title text when it differs from the toolbar title (e.g. a greeting). */
  readonly heading = input<string>();
  /** Small line above the large title (e.g. today's date). */
  readonly kicker = input<string | null>();
  readonly refreshable = input(false, { transform: booleanAttribute });
  /** Announced while refreshing. */
  readonly refreshingText = input('Updating');
  /** Wider content area (two-column layouts on tablets). */
  readonly wide = input(false, { transform: booleanAttribute });

  readonly refresh = output<PageRefreshEvent>();

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

  protected onRefresh(event: Event): void {
    const refresher = event.target as HTMLIonRefresherElement;
    this.refresh.emit({ complete: () => void refresher.complete() });
  }
}
