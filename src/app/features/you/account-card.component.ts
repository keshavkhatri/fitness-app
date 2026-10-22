import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';
import { SIGN_IN_PATH, SIGN_UP_PATH } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { FitnessButtonComponent, LoadingSkeletonComponent } from '../../shared/ui';

/**
 * The You tab's account section. Accounts are optional: a guest sees what an account is for and
 * keeps using the app; a signed-in person sees who they are and can sign out. Neither changes the
 * data on this device; uploading happens only through the opt-in cloud backup (Settings).
 */
@Component({
  selector: 'app-account-card',
  template: `
    <section class="account" aria-labelledby="you-account" data-testid="account-card">
      <h2 class="section-title" id="you-account">Account</h2>
      <div class="card">
        @let state = auth.state();
        @switch (state.status) {
          @case ('signed-in') {
            <div class="who">
              <span class="avatar" aria-hidden="true"><ion-icon name="person-circle-outline" /></span>
              <span class="who-text">
                <span class="name" data-testid="account-name">{{ state.user.name || state.user.email }}</span>&ngsp;
                <span class="email" data-testid="account-email">{{ state.user.email }}</span>
              </span>
            </div>
            <p class="hint">Signed in. Your data stays on this device unless you turn on cloud backup below.</p>
            @if (!state.verified) {
              <p class="hint" data-testid="account-unverified">Couldn't reach StokeForm to confirm your sign-in. It will be checked again next time.</p>
            }
            <button fit-button type="button" variant="outline" block icon="log-out-outline" [loading]="signingOut()" (click)="signOut()" data-testid="account-sign-out">
              Sign out
            </button>
            <p class="hint">Signing out keeps everything on this device.</p>
          }
          @case ('restoring') {
            <fit-skeleton height="44px" radius="md" />
          }
          @default {
            <p class="lead" data-testid="account-guest">You're using StokeForm on this device only.</p>
            <p class="hint">With an account you can turn on cloud backup, so your data is safe if you lose your phone and follows you to a new one. Without backup, your data stays on this device.</p>
            @if (auth.available) {
              <div class="actions">
                <button fit-button type="button" block (click)="open(signUpPath)" data-testid="account-sign-up">Create account</button>
                <button fit-button type="button" variant="outline" block (click)="open(signInPath)" data-testid="account-sign-in">Sign in</button>
              </div>
            }
          }
        }
      </div>
    </section>
  `,
  styles: `
    @use 'mixins' as fx;
    .account { display: flex; flex-direction: column; gap: var(--space-3); }
    .section-title { @include fx.text(h3, bold); }
    .card { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-lg); background: var(--color-surface); }
    .who { display: flex; gap: var(--space-3); align-items: center; min-width: 0; }
    .avatar { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-pill);
      background: var(--color-primary-soft); color: var(--color-primary-text); font-size: 26px; }
    .who-text { display: flex; flex-direction: column; min-width: 0; }
    .name { @include fx.text(body, semibold); overflow-wrap: anywhere; }
    .email { @include fx.text(body-sm); color: var(--color-text-secondary); overflow-wrap: anywhere; }
    .lead { @include fx.text(body, medium); }
    .hint { @include fx.text(body-sm); color: var(--color-text-secondary); }
    .actions { display: flex; flex-direction: column; gap: var(--space-2); }
  `,
  imports: [IonIcon, FitnessButtonComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountCardComponent {
  protected readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);
  protected readonly signInPath = SIGN_IN_PATH;
  protected readonly signUpPath = SIGN_UP_PATH;
  protected readonly signingOut = signal(false);

  protected open(path: string): void {
    void this.nav.navigateForward(path);
  }

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
    }
  }
}
