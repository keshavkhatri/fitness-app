import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Workout',
    loadComponent: () => import('./workout.page').then((m) => m.WorkoutPage),
  },
] satisfies Routes;
