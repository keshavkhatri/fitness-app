import { Routes } from '@angular/router';

import { requireOnboardingComplete } from './core/profile/onboarding.guards';

/**
 * Top-level routes.
 *
 * - Tab destinations live under the tabs shell. Each feature owns its own
 *   route file (`features/<area>/<area>.routes.ts`), so nested pages such as
 *   `workout/plans/:id` are added there without touching this file.
 * - Full-screen flows that should hide the tab bar (e.g. onboarding, a future
 *   active workout) go as siblings of the shell route, above the wildcard.
 * - First run: onboarding → assessment → home. The shell requires a profile
 *   and a reviewed assessment; guards send users to whichever step is
 *   outstanding (see core/profile/onboarding.guards.ts).
 */
export const routes: Routes = [
  { path: 'onboarding', loadChildren: () => import('./features/onboarding/onboarding.routes') },
  { path: 'assessment', loadChildren: () => import('./features/assessment/assessment.routes') },
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
    canActivate: [requireOnboardingComplete],
    loadComponent: () => import('./shell/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'home', loadChildren: () => import('./features/home/home.routes') },
      { path: 'workout', loadChildren: () => import('./features/workout/workout.routes') },
      { path: 'nutrition', loadChildren: () => import('./features/nutrition/nutrition.routes') },
      { path: 'you', loadChildren: () => import('./features/you/you.routes') },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];
