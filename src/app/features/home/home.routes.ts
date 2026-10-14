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
  {
    path: 'notifications/:notificationId',
    title: 'Notification',
    loadComponent: () => import('../notifications/notification-detail.page').then((m) => m.NotificationDetailPage),
  },
] satisfies Routes;
