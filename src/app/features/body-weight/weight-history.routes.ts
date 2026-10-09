import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Body weight',
    loadComponent: () => import('./weight-history.page').then((m) => m.WeightHistoryPage),
  },
  {
    path: 'new',
    title: 'Add weight',
    loadComponent: () => import('./weight-entry.page').then((m) => m.WeightEntryPage),
  },
  {
    // `entryId` is the weight entry's stable id.
    path: ':entryId',
    title: 'Edit weight',
    loadComponent: () => import('./weight-entry.page').then((m) => m.WeightEntryPage),
  },
] satisfies Routes;
