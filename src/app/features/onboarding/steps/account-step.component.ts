import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';

import { AuthError, AuthProviders } from '../../../core/auth/auth-api';
import { SIGN_IN_PATH, SIGN_UP_PATH } from '../../../core/auth/auth.guards';
import { AuthService } from '../../../core/auth/auth.service';
import { NAME_MAX_LENGTH, UserIdentityService, normalizeName } from '../../../core/identity/user-identity.service';
import { ONBOARDING_PATH } from '../../../core/profile/onboarding.guards';
import { FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent, TextFieldComponent } from '../../../shared/ui';
import { AUTH_COPY, AUTH_ERRORS } from '../../auth/auth-content';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

/** null while checking; then what the account service offers, or why it can't be used. */
type Providers = { readonly kind: 'ready'; readonly value: AuthProviders } | { readonly kind: 'off' } | { readonly kind: 'error'; readonly error: AuthError };

/**
 * The account gate, after the questionnaire and before anything personal is shown. The profile (and so
 * the assessment and the workout plan) is created only once the person is signed in: the page calls
 * `OnboardingFlow.complete()` when `submit()` says the gate is passed.
 *
 * Reuses the existing account system: Google here (system browser and app link), email sign-up / sign-in
 * and password reset on the existing account screens, which return here (`next=/onboarding`). The
 * questionnaire draft is stored on the device, so it survives those trips, a pending email
 * confirmation, a Google redirect, a failure or a restart.
 *
 * The name comes from the account (Google's profile name, or the one given at sign-up); only if it has
 * none is it asked here, once. If this build or server has accounts switched off, setup continues
 * without one (the app is fully usable on the device) rather than stranding the person.
 */
@Component({
  selector: 'app-account-step',
  template: `
    @let s = auth.state();
    @if (s.status === 'signed-in') {
      <header class="header">
        <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>You're signed in</h1>
        <p class="helper" data-testid="account-step-signed-in">
          Signed in as <strong>{{ s.user.email }}</strong>. Your personal starting point and workout plan are next.
        </p>
      </header>
    } @else {
      <header class="header">
        <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>Create your account to see your plan</h1>
        <p class="helper">Your answers are ready. Sign in or create a free account to see your starting point and personal workout plan.</p>
      </header>
    }

    <p class="local-data" data-testid="account-step-local">
      <ion-icon name="phone-portrait-outline" aria-hidden="true" />
      <span>{{ copy.localData }}</span>
    </p>

    @if (s.status === 'signed-in') {
      @if (needsName()) {
        <fit-text-field
          #nameField
          label="What should we call you?"
          autocomplete="given-name"
          hint="Shown on your Home screen. You can change it any time in You."
          [maxLength]="nameMax"
          [value]="name()"
          (valueChange)="name.set($event)"
          [error]="nameError()"
          data-testid="account-step-name"
        />
      } @else {
        <p class="helper" data-testid="account-step-greeting">We'll call you {{ displayName() }}. You can change it any time in You.</p>
      }
    } @else if (s.status === 'restoring' || providers() === null) {
      <fit-skeleton height="52px" radius="card" />
      <fit-skeleton height="52px" radius="card" />
    } @else {
      @let p = providers()!;
      @switch (p.kind) {
        @case ('off') {
          <fit-notice tone="info" [headingLevel]="2" title="Accounts aren't available in this version" data-testid="account-step-off">
            You can set up and use StokeForm on this device without one, and create an account later from You.
          </fit-notice>
          @if (needsName()) {
            <fit-text-field
              #nameField
              label="What should we call you?"
              autocomplete="given-name"
              [maxLength]="nameMax"
              [value]="name()"
              (valueChange)="name.set($event)"
              [error]="nameError()"
              data-testid="account-step-name"
            />
          }
        }
        @case ('error') {
          <fit-notice tone="danger" [headingLevel]="2" [title]="errorCopy(p.error).title" role="alert" data-testid="account-step-error">
            {{ errorCopy(p.error).message }}
          </fit-notice>
          <button fit-button type="button" variant="outline" size="lg" block (click)="checkProviders()" data-testid="account-step-retry">Try again</button>
        }
        @case ('ready') {
          @if (auth.googleError(); as error) {
            <fit-notice tone="danger" [headingLevel]="2" [title]="errorCopy(error).title" role="alert" data-testid="account-step-google-error">
              {{ errorCopy(error).message }}
            </fit-notice>
          }
          @if (auth.googlePending()) {
            <p class="pending" role="status" data-testid="account-step-google-pending">{{ copy.googlePending }}</p>
          }
          <div class="choices">
            @if (p.value.google) {
              <button fit-button type="button" variant="outline" size="lg" block icon="logo-google" [disabled]="starting()" (click)="google()" data-testid="account-step-google">
                {{ copy.google }}
              </button>
            }
            @if (p.value.emailPassword) {
              <button fit-button type="button" size="lg" block (click)="openAccountScreen('sign-up')" data-testid="account-step-sign-up">
                Create account with email
              </button>
              <p class="switch">
                Already have an account?
                <button type="button" class="link" (click)="openAccountScreen('sign-in')" data-testid="account-step-sign-in">Sign in</button>
              </p>
            }
          </div>
        }
      }
    }
  `,
  styleUrl: './account-step.component.scss',
  imports: [IonIcon, FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent, TextFieldComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: AccountStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountStepComponent implements OnboardingStepForm {
  protected readonly auth = inject(AuthService);
  private readonly identity = inject(UserIdentityService);
  private readonly nav = inject(NavController);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly copy = AUTH_COPY;
  protected readonly nameMax = NAME_MAX_LENGTH;
  protected readonly providers = signal<Providers | null>(null);
  protected readonly starting = signal(false);

  protected readonly name = signal('');
  private readonly submitted = signal(false);
  private readonly nameField = viewChild<TextFieldComponent>('nameField');

  private readonly signedIn = computed(() => this.auth.state().status === 'signed-in');
  private readonly accountsOff = computed(() => !this.signedIn() && this.providers()?.kind === 'off');
  /** The account's own name, when it has a usable one. */
  private readonly accountName = computed(() => normalizeName(this.auth.user()?.name));
  /** A name already chosen on this device (You → name and photo) wins over the account's. */
  protected readonly displayName = computed(() => this.identity.identity().name ?? this.accountName());
  protected readonly needsName = computed(() => (this.signedIn() || this.accountsOff()) && this.displayName() === null);
  protected readonly nameError = computed(() => (this.submitted() && !normalizeName(this.name()) ? 'Add your name to continue.' : null));

  /** Signed out with accounts available: the choices above are the actions, not the footer button. */
  readonly primaryHidden = computed(() => !this.signedIn() && !this.accountsOff());
  readonly primaryLabel = computed(() => (this.accountsOff() ? 'Continue without an account' : null));

  constructor() {
    void this.identity.load().catch(() => undefined);
    void this.checkProviders();
  }

  protected async checkProviders(): Promise<void> {
    this.providers.set(null);
    if (!this.auth.available) {
      this.providers.set({ kind: 'off' });
      return;
    }
    const result = await this.auth.providers();
    if (result.ok) {
      this.providers.set(result.value.accounts ? { kind: 'ready', value: result.value } : { kind: 'off' });
    } else {
      this.providers.set(result.error === 'not-configured' ? { kind: 'off' } : { kind: 'error', error: result.error });
    }
  }

  protected errorCopy(error: AuthError) {
    return AUTH_ERRORS[error];
  }

  protected async google(): Promise<void> {
    this.starting.set(true);
    try {
      await this.auth.startGoogle();
    } finally {
      this.starting.set(false);
    }
  }

  /** The existing account screens, which come back here once signed in (the draft waits on the device). */
  protected openAccountScreen(mode: 'sign-up' | 'sign-in'): void {
    void this.nav.navigateForward(mode === 'sign-up' ? SIGN_UP_PATH : SIGN_IN_PATH, { queryParams: { next: ONBOARDING_PATH } });
  }

  /** The gate is passed once signed in (or accounts are off here) and a name is known. */
  submit(): boolean {
    if (!this.signedIn() && !this.accountsOff()) {
      return false;
    }
    if (this.needsName()) {
      this.submitted.set(true);
      const name = normalizeName(this.name());
      if (!name) {
        this.nameField()?.focus();
        return false;
      }
      this.saveName(name, this.signedIn());
      return true;
    }
    const known = this.displayName();
    if (known && this.identity.identity().name === null) {
      // Reuse the account's name for Home's greeting.
      this.saveName(known, false);
    }
    return true;
  }

  /** Cosmetic and best effort: a failure never blocks setup (the name can be set again in You). */
  private saveName(name: string, alsoOnAccount: boolean): void {
    const photo = this.identity.identity().photo;
    void this.identity.save({ name, photo }).catch(() => undefined);
    if (alsoOnAccount) {
      void this.auth.updateName(name).catch(() => undefined);
    }
  }
}
