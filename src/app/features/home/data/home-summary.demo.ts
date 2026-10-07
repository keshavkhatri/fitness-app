import { HomeSummary } from '../home.models';

/**
 * DEMO DATA — for visual development of the Home screen only.
 *
 * This is the only place demo content for Home lives. It is consumed solely by
 * `DemoHomeSummarySource` and must be removed when real data sources are wired up.
 * Do not import it from anywhere else.
 */
export const DEMO_HOME_SUMMARY: HomeSummary = {
  user: { firstName: 'Alex' },
  goal: {
    title: 'Build strength',
    description: 'Three full-body sessions a week with steady progressive overload.',
    currentWeek: 3,
    totalWeeks: 12,
  },
  todayWorkout: {
    name: 'Upper Body Strength',
    focus: 'Chest · Back · Shoulders',
    exerciseCount: 6,
    estimatedMinutes: 50,
  },
  nutrition: {
    caloriesConsumed: 1420,
    caloriesTarget: 2300,
    macros: [
      { key: 'protein', label: 'Protein', consumedGrams: 96, targetGrams: 150 },
      { key: 'carbs', label: 'Carbs', consumedGrams: 160, targetGrams: 250 },
      { key: 'fat', label: 'Fat', consumedGrams: 41, targetGrams: 75 },
    ],
  },
  progress: {
    workoutsCompletedThisWeek: 2,
    workoutsPlannedThisWeek: 3,
    metrics: [
      {
        id: 'body-weight',
        label: 'Body weight',
        value: '78.4',
        unit: 'kg',
        trend: { direction: 'down', sentiment: 'positive', label: '0.6 kg this week' },
      },
      {
        id: 'bench-press',
        label: 'Bench press',
        value: '82.5',
        unit: 'kg',
        trend: { direction: 'up', sentiment: 'positive', label: '2.5 kg in 2 weeks' },
      },
    ],
  },
};
