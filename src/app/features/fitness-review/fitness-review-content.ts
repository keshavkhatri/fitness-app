/** User-facing copy for the Weekly Fitness Review: factual, specific, no motivational filler. */
export const FITNESS_REVIEW_COPY = {
  title: 'Weekly review',
  back: 'Back',
  loading: 'Loading your weekly review',
  entry: { title: 'Weekly review', description: 'What went well and what to focus on next' },
  intro: 'From what you recorded. Nothing here changes your plan, targets or records.',
  previous: 'Previous week',
  next: 'Next week',
  backToLastWeek: 'Back to last week',
  soFar: 'so far',
  progress: 'View detailed progress',
  tabs: { legend: 'Review sections', summary: 'Summary', trends: 'Trends', insights: 'Insights' },

  overview: {
    title: 'Overview',
    workouts: 'Workouts',
    food: 'Food logged',
    weight: 'Weight, 4 weeks',
    noData: 'Not recorded',
  },

  actions: {
    title: 'Focus for next week',
    titleCurrent: 'Focus for the rest of this week',
    none: 'Nothing stands out from your records. Keep going as planned.',
  },

  training: {
    title: 'Training',
    unavailable: "Your workout history couldn't be read.",
    none: 'No workouts finished in this week.',
    improving: 'Improving',
    stalled: 'No recent improvement',
    notEnough: (n: number) =>
      `${n === 1 ? '1 exercise needs' : `${n} exercises need`} more comparable sessions before a trend can be shown.`,
    rule: 'Compared only with earlier sessions of the same exercise, logged the same way and in the same unit.',
  },

  nutrition: {
    title: 'Nutrition',
    unavailable: "Your food log couldn't be read.",
    none: 'No food logged in this week.',
    calories: 'Calories',
    protein: 'Protein',
    perDay: 'a day',
    target: (value: string) => `target ${value}`,
    averageNote: 'Averages over the days with food logged; days without entries aren’t counted as zero.',
  },

  body: {
    title: 'Body',
    weight: 'Weight',
    measurements: 'Measurements',
    composition: 'InBody reports',
    unavailable: "These records couldn't be read.",
    weightInsufficient: (n: number) =>
      n === 0 ? 'No weigh-ins in the last 4 weeks.' : `Only ${n === 1 ? 'one weigh-in' : 'weigh-ins on one day'} in the last 4 weeks: not enough for a trend.`,
    weightNote: 'Body weight moves day to day with water and food, so look at the trend over weeks.',
    measurementsNone: 'No recent measurements to compare (a site needs two readings).',
    compositionNone: 'Fewer than two recent InBody reports to compare.',
    compositionMeasured: 'As measured on your reports, each metric compared with its own earlier reading.',
    compositionNote: 'Report-to-report changes can include differences in hydration; they don’t show fat or muscle change on their own.',
    differentUnits: 'not compared (different units)',
  },

  links: {
    workout: 'Open workout',
    nutritionWeek: 'Open weekly nutrition',
    checkIn: 'Calorie check-in',
    nutrition: 'Open nutrition',
    exercise: 'See exercise',
    weighIn: 'Log weight',
    measure: 'Add measurement',
    weightHistory: 'Weight history',
    measurements: 'Measurements',
    composition: 'InBody reports',
  },

  error: {
    title: "We couldn't build your review",
    message: 'Something went wrong while reading your records. Nothing has been changed.',
    retry: 'Try again',
  },
} as const;
