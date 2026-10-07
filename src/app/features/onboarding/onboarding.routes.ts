import { Routes } from '@angular/router';

import { redirectIfOnboarded } from '../../core/profile/onboarding.guards';
import { OnboardingFlow } from './state/onboarding-flow.service';

export default [
  {
    path: '',
    title: 'Welcome',
    canActivate: [redirectIfOnboarded],
    providers: [OnboardingFlow],
    loadComponent: () => import('./onboarding.page').then((m) => m.OnboardingPage),
  },
] satisfies Routes;
