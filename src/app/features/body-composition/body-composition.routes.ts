import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Body composition',
    loadComponent: () => import('./body-composition-history.page').then((m) => m.BodyCompositionHistoryPage),
  },
  {
    path: 'new',
    title: 'Add body composition',
    loadComponent: () => import('./body-composition-entry.page').then((m) => m.BodyCompositionEntryPage),
  },
  {
    path: ':assessmentId',
    title: 'Body composition assessment',
    loadComponent: () => import('./body-composition-detail.page').then((m) => m.BodyCompositionDetailPage),
  },
] satisfies Routes;
