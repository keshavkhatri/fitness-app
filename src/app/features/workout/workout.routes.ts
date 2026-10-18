import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Workout',
    loadComponent: () => import('./workout.page').then((m) => m.WorkoutPage),
  },
  {
    path: 'history',
    title: 'Workout history',
    loadComponent: () => import('./history/workout-history.page').then((m) => m.WorkoutHistoryPage),
  },
  {
    path: 'history/:workoutId',
    title: 'Workout history',
    loadComponent: () => import('./history/workout-history-detail.page').then((m) => m.WorkoutHistoryDetailPage),
  },
  {
    // Browse and open exercises: Free. (Adding them to a custom plan is the Premium editor's route.)
    path: 'exercises',
    title: 'Exercise library',
    loadComponent: () => import('./custom-plan/exercise-picker.page').then((m) => m.ExercisePickerPage),
  },
  {
    // `sessionId` is the plan's session id (e.g. "day-3-upper"), never a display name.
    path: 'session/:sessionId',
    title: 'Workout',
    loadComponent: () => import('./workout-detail.page').then((m) => m.WorkoutDetailPage),
  },
] satisfies Routes;
