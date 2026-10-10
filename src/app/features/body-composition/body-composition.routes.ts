import { Routes } from '@angular/router';

export default [
  {
    path: 'new',
    title: 'Add body composition',
    loadComponent: () => import('./body-composition-entry.page').then((m) => m.BodyCompositionEntryPage),
  },
] satisfies Routes;
