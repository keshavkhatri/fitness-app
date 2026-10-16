import { Routes } from '@angular/router';
import { redirectIfSignedIn } from '../../core/auth/auth.guards';

/** Account screens: full-screen, outside the tab bar, and reachable whether or not onboarding is done. */
export default [
  {
    path: 'sign-in',
    title: 'Sign in',
    canActivate: [redirectIfSignedIn],
    data: { mode: 'sign-in' },
    loadComponent: () => import('./account-form.page').then((m) => m.AccountFormPage),
  },
  {
    path: 'sign-up',
    title: 'Create account',
    canActivate: [redirectIfSignedIn],
    data: { mode: 'sign-up' },
    loadComponent: () => import('./account-form.page').then((m) => m.AccountFormPage),
  },
  {
    path: 'forgot-password',
    title: 'Reset your password',
    canActivate: [redirectIfSignedIn],
    loadComponent: () => import('./forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'callback',
    title: 'Signing in',
    loadComponent: () => import('./auth-callback.page').then((m) => m.AuthCallbackPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'sign-in' },
] satisfies Routes;
