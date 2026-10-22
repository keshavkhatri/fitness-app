import { Routes } from '@angular/router';

import { provideStackNav } from '../../../core/navigation/stack-nav';

/** Progress lives under You (`/you/progress`); it presents workout data, so its code sits with the workout feature. */
export default [
  {
    path: '',
    title: 'Progress',
    loadComponent: () => import('./progress.page').then((m) => m.ProgressPage),
  },
  {
    path: 'exercises',
    title: 'Progress',
    loadComponent: () => import('./progress-exercises.page').then((m) => m.ProgressExercisesPage),
  },
  {
    // Grouped by the exercise id stored in workout logs, never by display name.
    path: 'exercise/:exerciseId',
    title: 'Progress',
    loadComponent: () => import('./exercise-performance.page').then((m) => m.ExercisePerformancePage),
  },
  {
    // The one historical-workout screen (also at /workout/history/:workoutId), mounted in this
    // stack too, as Progress itself is under /progress and /you/progress: a session opened from
    // an exercise's performance comes back to it, without switching tabs.
    path: 'workout/:workoutId',
    title: 'Progress',
    loadComponent: () => import('../history/workout-history-detail.page').then((m) => m.WorkoutHistoryDetailPage),
  },
  // The body sections Progress links to, in this stack too: opened from the Progress tab, Back comes back to it
  // (their own links are kept in this tab by provideStackNav). Under You they are the You routes themselves.
  { path: 'weight-history', providers: [provideStackNav('/progress')], loadChildren: () => import('../../body-weight/weight-history.routes') },
  { path: 'measurements', providers: [provideStackNav('/progress')], loadChildren: () => import('../../body-measurements/measurements.routes') },
  { path: 'body-composition', providers: [provideStackNav('/progress')], loadChildren: () => import('../../body-composition/body-composition.routes') },
] satisfies Routes;
