import { Routes } from '@angular/router';

import { requireAppReady, requireOnboardingComplete } from './core/profile/onboarding.guards';

/**
 * Top-level routes.
 *
 * - Tab destinations live under the tabs shell. Each feature owns its own
 *   route file (`features/<area>/<area>.routes.ts`), so nested pages such as
 *   `workout/plans/:id` are added there without touching this file.
 * - Full-screen flows that should hide the tab bar (e.g. onboarding, a future
 *   active workout) go as siblings of the shell route, above the wildcard.
 * - First run: onboarding (questionnaire → account) → assessment → plan offer → home. The shell
 *   requires a profile and a reviewed assessment, and sends a user who has just finished setup to
 *   the offer once; guards send users to whichever step is outstanding (core/profile/onboarding.guards.ts).
 */
export const routes: Routes = [
  { path: 'onboarding', loadChildren: () => import('./features/onboarding/onboarding.routes') },
  { path: 'assessment', loadChildren: () => import('./features/assessment/assessment.routes') },
  // Optional accounts (sign in, create account, Google return). Not guarded by onboarding: the app
  // works without an account, and an account never replaces the local data.
  { path: 'auth', loadChildren: () => import('./features/auth/auth.routes') },
  // Free or Premium (full screen): once after first-run setup, and from You.
  {
    path: 'offer',
    title: 'Your plan',
    canActivate: [requireOnboardingComplete],
    loadComponent: () => import('./features/offer/offer.page').then((m) => m.OfferPage),
  },
  // Full-screen workout flows (no tab bar). Declared before the shell so they match first.
  {
    path: 'workout/session/:sessionId/active',
    title: 'Workout',
    canActivate: [requireOnboardingComplete],
    loadComponent: () => import('./features/workout/active/active-workout.page').then((m) => m.ActiveWorkoutPage),
  },
  {
    path: 'workout/summary/:workoutId',
    title: 'Workout summary',
    canActivate: [requireOnboardingComplete],
    loadComponent: () => import('./features/workout/summary/workout-summary.page').then((m) => m.WorkoutSummaryPage),
  },
  {
    path: '',
    canActivate: [requireAppReady],
    loadComponent: () => import('./shell/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'home', loadChildren: () => import('./features/home/home.routes') },
      { path: 'workout', loadChildren: () => import('./features/workout/workout.routes') },
      { path: 'nutrition', loadChildren: () => import('./features/nutrition/nutrition.routes') },
      // Its own tab; also reachable as /you/progress (You links there).
      { path: 'progress', loadChildren: () => import('./features/workout/progress/progress.routes') },
      { path: 'you', loadChildren: () => import('./features/you/you.routes') },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];
