import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';
import { AuthError, AuthProviders } from '../../core/auth/auth-api';
import { SIGN_IN_PATH } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { FitnessButtonComponent, NoticeComponent, TextFieldComponent } from '../../shared/ui';
import { AUTH_COPY, AUTH_ERRORS, validateEmail } from './auth-content';

/**
 * Asks for a password-reset email. The new password is chosen on a page of the server that the emailed
 * link opens in the browser (an email link opens the browser, not the app), so nothing secret ever
 * passes through this screen. It says the same thing for every address, so it can't be used to find out
 * who has an account.
 */
@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrl: './account-form.page.scss',
  imports: [IonContent, IonBackButton, IonIcon, RouterLink, FitnessButtonComponent, NoticeComponent, TextFieldComponent],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  protected readonly auth = inject(AuthService);
  protected readonly copy = AUTH_COPY;
  protected readonly forgot = AUTH_COPY.forgot;
  protected readonly signInPath = SIGN_IN_PATH;

  protected readonly email = signal('');
  protected readonly fieldError = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** Set once the request went through: the address the (identical) answer was about. */
  protected readonly sentTo = signal<string | null>(null);
  private readonly failure = signal<AuthError | null>(null);
  protected readonly error = computed(() => {
    const code = this.failure();
    return code ? AUTH_ERRORS[code] : null;
  });

  /** null while checking; then which methods the server offers (reset needs email delivery). */
  protected readonly providers = signal<AuthProviders | null>(null);

  constructor() {
    void this.auth.providers().then((result) => {
      this.providers.set(result.ok ? result.value : { accounts: this.auth.available, emailPassword: this.auth.available, google: false });
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const problem = validateEmail(this.email());
    this.fieldError.set(problem);
    this.failure.set(null);
    if (problem) {
      return;
    }
    this.busy.set(true);
    const address = this.email().trim();
    const result = await this.auth.requestPasswordReset(address);
    this.busy.set(false);
    if (result.ok) {
      this.sentTo.set(address);
    } else {
      this.failure.set(result.error);
    }
  }

  /** "Try again": back to the form, keeping the address. */
  protected again(): void {
    this.sentTo.set(null);
  }
}
