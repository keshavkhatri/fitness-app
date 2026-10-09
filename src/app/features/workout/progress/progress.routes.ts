import { Routes } from '@angular/router';

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
] satisfies Routes;
