import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Nutrition',
    loadComponent: () => import('./nutrition.page').then((m) => m.NutritionPage),
  },
] satisfies Routes;
