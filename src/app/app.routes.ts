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
 * - The shell requires a completed fitness profile; onboarding redirects to
 *   Home once one exists (see core/profile/onboarding.guards.ts).
 */
export const routes: Routes = [
  { path: 'onboarding', loadChildren: () => import('./features/onboarding/onboarding.routes') },
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
