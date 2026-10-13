import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'You',
    loadComponent: () => import('./you.page').then((m) => m.YouPage),
  },
  { path: 'progress', loadChildren: () => import('../workout/progress/progress.routes') },
  { path: 'weight-history', loadChildren: () => import('../body-weight/weight-history.routes') },
  { path: 'measurements', loadChildren: () => import('../body-measurements/measurements.routes') },
  {
    path: 'review',
    title: 'Weekly review',
    loadComponent: () => import('../fitness-review/fitness-review.page').then((m) => m.FitnessReviewPage),
  },
  { path: 'body-composition', loadChildren: () => import('../body-composition/body-composition.routes') },
] satisfies Routes;
