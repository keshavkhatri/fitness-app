import { Routes } from '@angular/router';

import { redirectIfOnboarded, requireProfile } from '../../core/profile/onboarding.guards';
import { OnboardingFlow } from './state/onboarding-flow.service';

const loadPage = () => import('./onboarding.page').then((m) => m.OnboardingPage);

export default [
  {
    path: '',
    title: 'Welcome',
    canActivate: [redirectIfOnboarded],
    providers: [OnboardingFlow],
    loadComponent: loadPage,
  },
  {
    // Review/edit an existing profile (e.g. "Review my details" from the assessment).
    path: 'review',
    title: 'Review your details',
    canActivate: [requireProfile],
    providers: [OnboardingFlow],
    data: { mode: 'review' },
    loadComponent: loadPage,
  },
] satisfies Routes;
