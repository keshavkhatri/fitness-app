import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';
import { AuthError, AuthProviders } from '../../core/auth/auth-api';
import { ACCOUNT_HOME_PATH, FORGOT_PASSWORD_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { UserIdentityService } from '../../core/identity/user-identity.service';
import { FitnessButtonComponent, NoticeComponent, TextFieldComponent } from '../../shared/ui';
import { AUTH_COPY, AUTH_ERRORS, AuthFormErrors, MAX_PASSWORD_LENGTH, NAME_MAX_LENGTH, safeNext, validateAuthForm } from './auth-content';

/**
 * Sign in and create account (one screen, two modes from the route). Reached from You; guests are
 * never sent here, and nothing about the app's local data changes when an account is used.
 */
@Component({
  selector: 'app-account-form',
  templateUrl: './account-form.page.html',
  styleUrl: './account-form.page.scss',
  imports: [IonContent, IonBackButton, IonIcon, RouterLink, FitnessButtonComponent, NoticeComponent, TextFieldComponent],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountFormPage {
  /** From the route's data. */
  readonly mode = input<'sign-in' | 'sign-up'>('sign-in');
  /** Query parameter: an in-app path to return to. */
  readonly next = input<string | undefined>();

  protected readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);
  private readonly identity = inject(UserIdentityService);

  protected readonly copy = AUTH_COPY;
  protected readonly homePath = ACCOUNT_HOME_PATH;
  protected readonly nameMax = NAME_MAX_LENGTH;
  protected readonly passwordMax = MAX_PASSWORD_LENGTH;
  protected readonly text = computed(() => (this.mode() === 'sign-up' ? AUTH_COPY.signUp : AUTH_COPY.signIn));
  protected readonly switchPath = computed(() => (this.mode() === 'sign-up' ? SIGN_IN_PATH : SIGN_UP_PATH));
  protected readonly signInPath = SIGN_IN_PATH;
  protected readonly forgotPath = FORGOT_PASSWORD_PATH;

  // The name the app already uses (You → name and photo) is offered for the account.
  protected readonly name = signal(this.identity.identity().name ?? '');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly fieldErrors = signal<AuthFormErrors>({});
  protected readonly busy = signal(false);
  private readonly failure = signal<AuthError | null>(null);
  protected readonly error = computed(() => {
    const code = this.failure() ?? this.auth.googleError();
    return code ? AUTH_ERRORS[code] : null;
  });

  /** Google was started from this screen; its answer arrives through the deep link. */
  private readonly awaitingGoogle = signal(false);

  /** null while checking; then which methods work. */
  protected readonly providers = signal<AuthProviders | null>(null);
  /** Set after sign-up: the address that was sent a confirmation link. */
  protected readonly sentTo = signal<string | null>(null);

  constructor() {
    void this.auth.providers().then((result) => {
      // If the check fails (offline), still offer email: the attempt itself will explain.
      this.providers.set(result.ok ? result.value : { accounts: this.auth.available, emailPassword: this.auth.available, google: false });
    });
    // Google on Android finishes through the deep link while this screen is open.
    effect(() => {
      if (this.awaitingGoogle() && this.auth.state().status === 'signed-in') {
        this.awaitingGoogle.set(false);
        this.leave();
      }
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const values = { name: this.name(), email: this.email(), password: this.password() };
    const errors = validateAuthForm(values, this.mode());
    this.fieldErrors.set(errors);
    this.failure.set(null);
    this.auth.googleError.set(null);
    if (Object.keys(errors).length > 0) {
      return;
    }
    this.busy.set(true);
    const result = this.mode() === 'sign-up' ? await this.auth.signUp(values.name, values.email, values.password) : await this.auth.signIn(values.email, values.password);
    this.busy.set(false);
    if (result.ok) {
      this.password.set('');
      if (result.value === null) {
        // Signed up, not signed in: the address must be confirmed first.
        this.sentTo.set(values.email.trim());
      } else {
        this.leave();
      }
    } else {
      this.failure.set(result.error);
    }
  }

  protected async google(): Promise<void> {
    this.failure.set(null);
    this.awaitingGoogle.set(true);
    const result = await this.auth.startGoogle();
    if (!result.ok) {
      this.awaitingGoogle.set(false);
      this.failure.set(result.error);
    }
  }

  protected goToSignIn(): void {
    void this.nav.navigateForward(SIGN_IN_PATH, { replaceUrl: true, queryParams: this.next() ? { next: this.next() } : {} });
  }

  private leave(): void {
    void this.nav.navigateBack(safeNext(this.next(), ACCOUNT_HOME_PATH));
  }
}
