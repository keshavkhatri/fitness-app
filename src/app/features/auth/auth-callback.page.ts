import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { AuthError } from '../../core/auth/auth-api';
import { ACCOUNT_HOME_PATH, SIGN_IN_PATH } from '../../core/auth/auth.guards';
import { AuthService, googleErrorOf } from '../../core/auth/auth.service';
import { NoticeComponent } from '../../shared/ui';
import { AUTH_COPY, AUTH_ERRORS } from './auth-content';

/**
 * The web app's return page for Google sign-in (development in a browser). On Android and iOS the
 * answer comes back through the deep link instead and this page is not used.
 */
@Component({
  selector: 'app-auth-callback',
  template: `
    <ion-content>
      <main class="body">
        <h1 class="title">{{ copy.title }}</h1>
        @if (error(); as e) {
          <fit-notice tone="danger" [headingLevel]="2" [title]="e.title" role="alert" data-testid="callback-error">{{ e.message }}</fit-notice>
          <a class="link" [routerLink]="signInPath" replaceUrl>{{ copy.back }}</a>
        } @else {
          <p role="status">{{ copy.working }}</p>
        }
      </main>
    </ion-content>
  `,
  styles: `
    @use 'mixins' as fx;
    ion-content { --background: var(--color-bg); }
    .body { display: flex; flex-direction: column; gap: var(--space-4); max-width: var(--page-max-width); margin: 0 auto;
      padding: calc(var(--ion-safe-area-top, 0px) + var(--space-8)) var(--space-4) var(--space-10); }
    .title { @include fx.text(h1, bold); }
    .link { @include fx.focus-ring; color: var(--color-primary-text); font-weight: var(--font-weight-semibold); }
  `,
  imports: [IonContent, RouterLink, NoticeComponent],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackPage {
  /** Query parameter set by the server's redirect (an `error` parameter means Google sign-in failed). */
  readonly code = input<string | undefined>();
  private readonly route = inject(ActivatedRoute);

  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);
  protected readonly copy = AUTH_COPY.callback;
  protected readonly signInPath = SIGN_IN_PATH;
  private readonly failure = signal<AuthError | null>(null);
  protected readonly error = computed(() => {
    const code = this.failure();
    return code ? AUTH_ERRORS[code] : null;
  });

  constructor() {
    queueMicrotask(() => void this.finish());
  }

  private async finish(): Promise<void> {
    const code = this.code();
    const query = this.route.snapshot.queryParamMap;
    if (!code || query.has('error')) {
      this.failure.set(googleErrorOf(query.get('error')));
      return;
    }
    const result = await this.auth.completeGoogle(code);
    if (result.ok) {
      void this.nav.navigateRoot(ACCOUNT_HOME_PATH);
    } else {
      this.failure.set(result.error);
    }
  }
}
