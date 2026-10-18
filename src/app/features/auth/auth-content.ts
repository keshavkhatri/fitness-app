import { AuthError } from '../../core/auth/auth-api';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const NAME_MAX_LENGTH = 40;

export const AUTH_COPY = {
  back: 'Back',
  signIn: {
    title: 'Sign in',
    intro: 'Sign in to your StokeForm account.',
    submit: 'Sign in',
    switchPrompt: 'New to StokeForm?',
    switchAction: 'Create an account',
  },
  signUp: {
    title: 'Create your account',
    intro: 'An account is the first step towards backup and syncing across your devices.',
    submit: 'Create account',
    switchPrompt: 'Already have an account?',
    switchAction: 'Sign in',
  },
  /** Said plainly on every account screen: nothing is uploaded yet. */
  localData: 'Your workouts, food and measurements stay on this device. Nothing is uploaded or synced yet.',
  fields: {
    name: 'Name',
    email: 'Email',
    password: 'Password',
    passwordHint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  or: 'or',
  google: 'Continue with Google',
  googlePending: 'Finish signing in with Google in the browser window, then come back here.',
  unavailable: {
    title: "Accounts aren't available",
    message: 'The account service is not set up for this version of the app. Everything else works as usual.',
  },
  checking: 'Checking sign-in options',
  forgot: {
    link: 'Forgot your password?',
    title: 'Reset your password',
    intro: "Enter the email address of your account and we'll email you a link to choose a new password.",
    submit: 'Send reset link',
    backToSignIn: 'Back to sign in',
    sentTitle: 'Check your email',
    /** The same words for every address: this screen never says whether an account exists. */
    sent: (email: string) =>
      `If ${email} has a StokeForm account, we've sent it a link to choose a new password. The link works once, for 1 hour, and opens in your browser.`,
    sentHint: "No email after a few minutes? Check your spam folder, or try again. After changing your password you'll be signed out of your other devices, then sign in here with the new one.",
  },
  /** After sign-up: the account exists but needs its address confirmed before anyone can sign in. */
  checkEmail: {
    title: 'Check your email',
    message: (email: string) =>
      `If ${email} can be used for a new account, we've sent it a confirmation link. Open the link, then come back and sign in. If this email already has an account, just sign in.`,
    hint: "No email after a few minutes? Check your spam folder, or sign in: we'll send a new link.",
    signIn: 'Go to sign in',
  },
  callback: {
    title: 'Finishing sign-in',
    working: 'Signing you in…',
    back: 'Back to sign in',
  },
} as const;

export const FIELD_ERRORS = {
  nameRequired: 'Enter your name.',
  nameTooLong: `Use at most ${NAME_MAX_LENGTH} characters.`,
  emailRequired: 'Enter your email address.',
  emailInvalid: 'Enter a valid email address, like name@example.com.',
  passwordRequired: 'Enter your password.',
  passwordTooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  passwordTooLong: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
} as const;

/** What each failure means to the person: never the server's own wording. */
export const AUTH_ERRORS: Readonly<Record<AuthError, { readonly title: string; readonly message: string }>> = {
  'invalid-credentials': { title: "Couldn't sign you in", message: "That email and password don't match an account. Check them and try again." },
  'email-taken': { title: 'That email already has an account', message: 'Sign in instead, or use a different email address.' },
  'weak-password': { title: 'Choose a different password', message: `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.` },
  'invalid-email': { title: 'Check your email address', message: 'Enter a valid email address, like name@example.com.' },
  'invalid-name': { title: 'Check your name', message: 'Enter the name to show on your account.' },
  'rate-limited': { title: 'Too many attempts', message: 'Wait a minute, then try again.' },
  'not-configured': { title: "Accounts aren't available", message: 'The account service is not set up right now. Everything else in the app works as usual.' },
  'google-not-configured': { title: "Google sign-in isn't available", message: 'Use your email and password instead.' },
  'google-failed': { title: "Google sign-in didn't finish", message: 'It was cancelled or failed. Try again, or use your email and password.' },
  'email-not-verified': {
    title: 'Confirm your email first',
    message: "We've sent a confirmation link to your email address. Open it, then sign in again.",
  },
  'account-not-linked': {
    title: 'This email already has an account',
    message:
      "It uses a password and its email address hasn't been confirmed, so it can't be joined to Google. Sign in with your email and password to get a confirmation link, then try Google again.",
  },
  'code-expired': { title: 'That sign-in expired', message: 'Start Google sign-in again from this screen.' },
  network: { title: "Couldn't reach StokeForm", message: 'Check your internet connection and try again.' },
  unavailable: { title: 'Something went wrong', message: "The account service didn't respond as expected. Try again later." },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthFormInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}
export type AuthFormErrors = Partial<Record<keyof AuthFormInput, string>>;

/** The checks done before anything is sent; the server checks again. */
export function validateAuthForm(input: AuthFormInput, mode: 'sign-in' | 'sign-up'): AuthFormErrors {
  const errors: AuthFormErrors = {};
  const email = input.email.trim();
  if (mode === 'sign-up') {
    const name = input.name.trim();
    if (!name) {
      errors.name = FIELD_ERRORS.nameRequired;
    } else if (name.length > NAME_MAX_LENGTH) {
      errors.name = FIELD_ERRORS.nameTooLong;
    }
  }
  if (!email) {
    errors.email = FIELD_ERRORS.emailRequired;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = FIELD_ERRORS.emailInvalid;
  }
  if (!input.password) {
    errors.password = FIELD_ERRORS.passwordRequired;
  } else if (mode === 'sign-up' && input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = FIELD_ERRORS.passwordTooShort;
  } else if (input.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = FIELD_ERRORS.passwordTooLong;
  }
  return errors;
}

/** The check before a reset link is requested (the server answers the same for every address). */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) {
    return FIELD_ERRORS.emailRequired;
  }
  return EMAIL_PATTERN.test(email) ? null : FIELD_ERRORS.emailInvalid;
}

/** Only in-app paths may be returned to after signing in. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://') ? next : fallback;
}
