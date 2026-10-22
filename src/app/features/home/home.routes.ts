import { Routes } from '@angular/router';

import { FOOD_PAGES, WORKOUT_DETAIL, YOU_SECTIONS, provideStackNav } from '../../core/navigation/stack-nav';

/**
 * Home and the pages its cards open. Weight history, measurements, body composition, add/edit food and a planned
 * workout's details are mounted in this stack too (at /home/…), and provideStackNav keeps their own links here:
 * opened from a dashboard card, Back returns to the dashboard instead of the tab the page normally belongs to.
 */
export default [
  {
    path: '',
    providers: [provideStackNav('/home', [YOU_SECTIONS, FOOD_PAGES, WORKOUT_DETAIL])],
    children: [
      {
        path: '',
        title: 'Home',
        loadComponent: () => import('./home.page').then((m) => m.HomePage),
      },
      {
        path: 'streak',
        title: 'Streak',
        loadComponent: () => import('./streak/streak.page').then((m) => m.StreakPage),
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
      { path: 'weight-history', loadChildren: () => import('../body-weight/weight-history.routes') },
      { path: 'measurements', loadChildren: () => import('../body-measurements/measurements.routes') },
      { path: 'body-composition', loadChildren: () => import('../body-composition/body-composition.routes') },
      {
        path: 'food/new',
        title: 'Add food',
        loadComponent: () => import('../nutrition/add-food.page').then((m) => m.AddFoodPage),
      },
      {
        path: 'food/:entryId',
        title: 'Edit food',
        loadComponent: () => import('../nutrition/food-entry.page').then((m) => m.FoodEntryPage),
      },
      {
        path: 'session/:sessionId',
        title: 'Workout',
        loadComponent: () => import('../workout/workout-detail.page').then((m) => m.WorkoutDetailPage),
      },
    ],
  },
] satisfies Routes;
