import { Routes } from '@angular/router';

import { requireProfile } from '../../core/profile/onboarding.guards';
import { AssessmentService } from './assessment.service';

export default [
  {
    path: '',
    title: 'Your starting point',
    canActivate: [requireProfile],
    providers: [AssessmentService],
    loadComponent: () => import('./assessment.page').then((m) => m.AssessmentPage),
  },
] satisfies Routes;
