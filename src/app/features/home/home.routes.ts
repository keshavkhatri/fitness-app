import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Home',
    loadComponent: () => import('./home.page').then((m) => m.HomePage),
  },
  {
    path: 'notifications',
    title: 'Notifications',
    loadComponent: () => import('../notifications/notifications.page').then((m) => m.NotificationsPage),
  },
] satisfies Routes;
