import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Measurements',
    loadComponent: () => import('./measurement-history.page').then((m) => m.MeasurementHistoryPage),
  },
  {
    path: 'new',
    title: 'Add measurements',
    loadComponent: () => import('./measurement-entry.page').then((m) => m.MeasurementEntryPage),
  },
  {
    // `entryId` is the measurement entry's stable id.
    path: ':entryId',
    title: 'Edit measurements',
    loadComponent: () => import('./measurement-entry.page').then((m) => m.MeasurementEntryPage),
  },
] satisfies Routes;
