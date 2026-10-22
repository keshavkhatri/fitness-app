import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'You',
    loadComponent: () => import('./you.page').then((m) => m.YouPage),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () => import('./settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'settings/delete-account',
    title: 'Delete account',
    loadComponent: () => import('./delete-account.page').then((m) => m.DeleteAccountPage),
  },
  {
    path: 'settings/notifications',
    title: 'Reminders',
    loadComponent: () => import('../reminders/reminder-settings.page').then((m) => m.ReminderSettingsPage),
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
