import { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: 'Nutrition',
    loadComponent: () => import('./nutrition.page').then((m) => m.NutritionPage),
  },
  {
    // Optional query parameter `date` (YYYY-MM-DD): opens the week containing it (default: this week).
    path: 'week',
    title: 'Weekly summary',
    loadComponent: () => import('./nutrition-week.page').then((m) => m.NutritionWeekPage),
  },
  {
    // Read-only until the user confirms a proposed calorie target in its sheet.
    path: 'check-in',
    title: 'Calorie check-in',
    loadComponent: () => import('../calorie-check-in/calorie-check-in.page').then((m) => m.CalorieCheckInPage),
  },
  {
    // Query parameters: `meal` (breakfast|lunch|dinner|snacks), `date` (YYYY-MM-DD).
    // Search of recent foods with one-tap add, or a food entered manually.
    path: 'food/new',
    title: 'Add food',
    loadComponent: () => import('./add-food.page').then((m) => m.AddFoodPage),
  },
  {
    // `entryId` is the food entry's stable id; query parameter `date` (YYYY-MM-DD).
    path: 'food/:entryId',
    title: 'Edit food',
    loadComponent: () => import('./food-entry.page').then((m) => m.FoodEntryPage),
  },
] satisfies Routes;
