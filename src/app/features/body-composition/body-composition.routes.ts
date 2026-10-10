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
] satisfies Routes;
