import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const SIGN_IN_PATH = '/auth/sign-in';
export const SIGN_UP_PATH = '/auth/sign-up';
export const FORGOT_PASSWORD_PATH = '/auth/forgot-password';
/** Where account screens return to: the You tab, which shows the account. */
export const ACCOUNT_HOME_PATH = '/you';

/**
 * For future screens that only make sense with an account (backup, sync). Not used by any existing
 * screen: the app works without an account, and guests are never sent to a login screen.
 */
export const requireSignedIn: CanActivateFn = async (_route, state) => {
  // Injected before awaiting: inject() only works synchronously inside the guard.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenRestored();
  return auth.state().status === 'signed-in' ? true : router.createUrlTree([SIGN_IN_PATH], { queryParams: { next: state.url } });
};

/** The sign-in and sign-up screens are pointless when already signed in. */
export const redirectIfSignedIn: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenRestored();
  return auth.state().status === 'signed-in' ? router.createUrlTree([ACCOUNT_HOME_PATH]) : true;
};
