import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { IonBackButton, IonContent, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { ThemeService } from '../../core/theme/theme.service';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../shared/ui';
import { ReportThumbComponent } from './components/report-thumb.component';
import { NEW_WEIGHT_PATH } from '../body-weight/weight-history-paths';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import { toBodyCompositionDetailScreen } from './body-composition-detail-view-model';
import { BODY_COMPOSITION_HISTORY_PATH, editBodyCompositionPath } from './body-composition-paths';

/**
 * One saved assessment: `/you/body-composition/:assessmentId`: every
 * recorded value and its difference from the previous assessment, with
 * Edit and Delete (after a confirmation). Nothing here changes the profile
 * or weight history; updating the profile weight stays the explicit "Use as
 * profile weight" action on a weigh-in.
 */
@Component({
  selector: 'app-body-composition-detail',
  templateUrl: './body-composition-detail.page.html',
  styleUrl: './body-composition-detail.page.scss',
  host: { class: 'fit-theme-immersive fit-tracking-form' },
  imports: [
    IonBackButton,
    IonContent,
    SegmentedControlComponent,
    ReportThumbComponent,
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyCompositionDetailPage {
  private readonly history = inject(BodyCompositionHistoryService);
  private readonly nav = inject(NavController);

  /** Route parameter (component input binding). */
  readonly assessmentId = input.required<string>();

  protected readonly copy = BODY_COMPOSITION_COPY.detail;
  protected readonly errorCopy = BODY_COMPOSITION_COPY.history.error;
  protected readonly returnPath = BODY_COMPOSITION_HISTORY_PATH;
  protected readonly screen = computed(() => toBodyCompositionDetailScreen(this.history.state(), this.assessmentId(), this.history.today()));

  /** The saved assessment shown; null while loading or when it doesn't exist. */
  private readonly assessment = computed(() => {
    const state = this.history.state();
    return state.status === 'ready' ? (state.assessments.find((a) => a.id === this.assessmentId()) ?? null) : null;
  });
  /** UI state only. */
  protected readonly tab = signal<'overview' | 'all'>('overview');
  protected readonly tabOptions: readonly SegmentOption<'overview' | 'all'>[] = [
    { value: 'overview', label: this.copy.overview },
    { value: 'all', label: this.copy.allValues },
  ];
  // Light status-bar text while this always-dark screen is open.
  private readonly statusBar = inject(DestroyRef).onDestroy(inject(ThemeService).holdAlwaysDark());
  protected readonly confirmOpen = signal(false);
  protected readonly deleting = signal(false);
  /** A failed delete. */
  protected readonly status = signal('');
  protected readonly deleteMessage = computed(() => {
    const s = this.screen();
    return this.copy.deleteConfirm.message(s.kind === 'ready' ? s.dateLabel : '');
  });

  constructor() {
    if (this.history.state().status !== 'ready') {
      void this.history.load();
    }
  }

  protected retry(): void {
    void this.history.load();
  }

  protected logWeight(): void {
    void this.nav.navigateForward(NEW_WEIGHT_PATH);
  }

  protected edit(): void {
    if (!this.deleting()) {
      void this.nav.navigateForward(editBodyCompositionPath(this.assessmentId()));
    }
  }

  protected askDelete(): void {
    if (!this.deleting()) {
      this.status.set('');
      this.confirmOpen.set(true);
    }
  }

  protected cancelDelete(): void {
    this.confirmOpen.set(false);
  }

  protected async confirmDelete(): Promise<void> {
    const assessment = this.assessment();
    this.confirmOpen.set(false);
    if (!assessment || this.deleting()) {
      return; // no double delete
    }
    this.deleting.set(true);
    try {
      if ((await this.history.remove(assessment)).ok) {
        void this.nav.navigateBack(BODY_COMPOSITION_HISTORY_PATH);
      } else {
        this.status.set(this.copy.deleteFailed);
      }
    } finally {
      this.deleting.set(false);
    }
  }

  protected back(): void {
    void this.nav.navigateBack(BODY_COMPOSITION_HISTORY_PATH);
  }
}
