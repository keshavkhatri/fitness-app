import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'You',
    loadComponent: () => import('./you.page').then((m) => m.YouPage),
  },
] satisfies Routes;
