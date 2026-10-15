import { FoodEntryField, FoodEntryProblem, MealCategory, QuantityUnit } from '../../domain/nutrition';

/**
 * User-facing copy for Nutrition. The domain speaks in codes and numbers;
 * everything a user reads is phrased here.
 */

export const MEAL_LABELS: Readonly<Record<MealCategory, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

/** Short unit shown after a quantity ("150 g", "2 servings"). */
export const UNIT_LABELS: Readonly<Record<QuantityUnit, { readonly option: string; readonly one: string; readonly many: string }>> = {
  g: { option: 'Grams (g)', one: 'g', many: 'g' },
  ml: { option: 'Millilitres (ml)', one: 'ml', many: 'ml' },
  serving: { option: 'Serving', one: 'serving', many: 'servings' },
  piece: { option: 'Piece', one: 'piece', many: 'pieces' },
};

export const NUTRITION_COPY = {
  title: 'Nutrition',
  loading: 'Loading nutrition',

  logFood: 'Log food',
  checkInHint: 'Compare your intake with your weight trend',

  date: {
    nav: 'Day',
    strip: 'Days this week',
    previous: 'Previous day',
    next: 'Next day',
    today: 'Today',
    backToToday: 'Back to today',
  },

  calories: {
    title: 'Calories',
    progressLabel: 'Calories eaten',
    eatenOnly: (eaten: string) => `${eaten} kcal eaten`,
    of: (target: string) => `of ${target} kcal`,
    eaten: 'kcal eaten',
    noTarget: 'No calorie target yet',
  },

  macros: {
    title: 'Macros',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
  },

  meals: {
    title: 'Meals',
    add: 'Add food',
    addTo: (meal: string) => `Add food to ${meal}`,
    empty: 'Nothing logged',
  },

  emptyDay: {
    title: 'Start with your first meal',
    message: 'Log what you eat to see your daily nutrition here.',
    action: 'Log food',
  },

  notices: {
    noProfile: {
      title: 'Set up your profile for targets',
      message: 'Your daily calorie and macro targets come from your fitness profile. You can still log food in the meantime.',
      action: 'Set up profile',
    },
    calorieReview: {
      title: 'Your targets need a second look',
      message:
        "We couldn't establish a calorie target with enough confidence. Review your profile details to see targets. You can still log food.",
      action: 'Review my details',
    },
    calorieAdjusted: {
      title: 'A steadier starting target',
      message: 'Your calorie target is a little less aggressive than your goal alone would suggest, to give you a sustainable place to begin.',
    },
    macrosConstrained: {
      title: 'Macro balance is limited',
      message: 'Your calorie target leaves limited room for all three macros, so these targets are a constrained starting point.',
    },
    macrosInfeasible: {
      title: 'Macro targets are on hold',
      message:
        "Your calorie and protein targets don't leave enough room for the minimum fat target. Review your goal or profile details to see macro targets.",
      action: 'Review my details',
    },
    unavailable: {
      title: "Targets aren't available right now",
      message: "We couldn't calculate your targets from your profile. Your food log is unaffected.",
      action: 'Review my details',
    },
  },

  /** One-line versions of the target notices, for compact cards (Home). */
  brief: {
    'no-profile': 'Set up your profile to see your daily targets.',
    unavailable: "Targets aren't available right now.",
    'calorie-review': 'Your targets need review.',
    'macros-infeasible': 'Your macro targets need review.',
  },

  week: {
    title: 'Weekly summary',
    heading: 'Nutrition',
    views: 'Nutrition view',
    dayView: 'Day',
    weekView: 'Week',
    caloriesTitle: 'Calories',
    caloriesByDay: 'Calories by day',
    legendFood: 'Food',
    legendTarget: 'Daily target',
    legendNotLogged: '– Not logged',
    averageThisWeek: 'Average this week',
    vsTarget: 'vs target',
    ofTarget: 'of target',
    macrosTitle: 'Macros',
    macroLegend: 'Macro',
    macroByDay: (name: string) => `${name} by day`,
    entry: 'Weekly summary',
    back: 'Nutrition',
    loading: 'Loading your week',
    previous: 'Previous week',
    next: 'Next week',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    backToThisWeek: 'Back to this week',
    logged: (logged: number, days: number, current: boolean) =>
      `Food logged on ${logged} of ${days} ${days === 1 ? 'day' : 'days'}${current ? ' so far' : ''}`,
    totalTitle: 'Total this week',
    averageTitle: 'Daily average',
    averageCaption: (logged: number) => `Across the ${logged === 1 ? 'day' : `${logged} days`} with food logged. Days without entries aren't counted.`,
    belowTarget: (kcal: string) => `${kcal} kcal below your daily target`,
    overTarget: (kcal: string) => `${kcal} kcal over your daily target`,
    onTarget: 'On your daily target',
    dayBelow: (kcal: string) => `${kcal} kcal below target`,
    dayOver: (kcal: string) => `${kcal} kcal over target`,
    dayOnTarget: 'On target',
    targetsNote: 'Compared with your current daily targets.',
    daysTitle: 'Day by day',
    notLogged: 'Nothing logged',
    upcoming: 'Upcoming',
    today: 'Today',
    openDay: (day: string) => `Open ${day} in your food log`,
    empty: {
      title: 'No food logged this week',
      message: 'Log what you eat and your week’s totals and averages appear here.',
      action: 'Log food',
    },
    error: {
      title: "We couldn't load this week",
      message: 'Something went wrong while reading your saved food. Nothing has been changed.',
      retry: 'Try again',
    },
  },

  error: {
    title: "We couldn't load your food log",
    message: 'Something went wrong while reading your saved food. Nothing has been changed.',
    retry: 'Try again',
  },

  add: {
    title: 'Add food',
    back: 'Back to nutrition',
    backToSearch: 'Back to search',
    mealLegend: 'Meal',
    search: 'Search your recent foods',
    clear: 'Clear search',
    recentTitle: 'Recent foods',
    recentHint: 'Foods you logged in the last 30 days. Tap + to add one as it was, or tap the food to change it first.',
    loading: 'Loading recent foods',
    none: {
      title: 'No recent foods yet',
      message: 'Foods you log appear here, ready to add again in one tap.',
    },
    noMatch: (query: string) => `No recent foods match “${query}”.`,
    error: {
      title: "We couldn't load your recent foods",
      message: 'You can still enter a food manually.',
      retry: 'Try again',
    },
    results: (count: number) => `${count} recent ${count === 1 ? 'food' : 'foods'}`,
    addLabel: (name: string, detail: string, meal: string) => `Add ${name}, ${detail}, to ${meal}`,
    reviewLabel: (name: string, detail: string) => `Change ${name}, ${detail}, before adding`,
    added: (name: string, meal: string, day: string) => `Added ${name} to ${meal}, ${day}.`,
    addFailed: (name: string) => `${name} couldn't be added. Please try again.`,
    manual: 'Enter food manually',
    manualTitle: 'Enter food',
    saveTo: (day: string) => `Save to ${day}`,
  },

  form: {
    addTitle: 'Add food',
    recent: {
      title: 'Recent foods',
      hint: 'Tap a food to fill in the form, then check it and save.',
      choose: (name: string, detail: string) => `Fill in ${name}, ${detail}`,
      filled: (name: string) => `Filled in ${name}. Check the values, then save.`,
    },
    editTitle: 'Edit food',
    close: 'Close',
    servingSize: 'Serving size',
    servingHint: (unit: string) => `In ${unit}, as recorded. Nutrition scales with the amount.`,
    perServing: 'Nutrition per serving',
    servings: 'Number of servings',
    fewer: 'Fewer servings',
    more: 'More servings',
    total: 'Total',
    mealLegend: 'Meal',
    editDetails: 'Edit name and nutrition values',
    portionErrors: {
      'serving-required': 'Enter a serving size.',
      'serving-not-a-number': 'Enter a number, like 100 or 1.5.',
      'serving-not-positive': 'Enter a serving size above 0.',
      'servings-out-of-range': 'Choose between 0.5 and 20 servings.',
      'too-large': 'That’s more than one entry can hold. Use a smaller amount.',
    },
    totalUnavailable: 'Enter a serving size to see the total.',
    back: 'Nutrition',
    name: 'Food name',
    namePlaceholderHint: 'For example: Greek yogurt',
    quantity: 'Quantity',
    unit: 'Unit',
    meal: 'Meal',
    nutritionTitle: 'Nutrition for this amount',
    nutritionHint: 'Enter the values for the quantity you ate.',
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbohydrates',
    fat: 'Fat',
    save: 'Save',
    saveChanges: 'Save changes',
    saving: 'Saving',
    delete: 'Delete food',
    fixErrors: 'Check the highlighted fields.',
    saveFailed: "Your food couldn't be saved. Please try again.",
    deleteFailed: "This food couldn't be deleted. Please try again.",
    loadingEntry: 'Loading food',
    notFound: {
      title: 'Food not found',
      message: 'This food may already have been deleted.',
    },
    loadFailed: {
      title: "We couldn't load this food",
      message: 'Something went wrong while reading your saved food.',
      retry: 'Try again',
    },
    backToNutrition: 'Back to nutrition',
    deleteConfirm: {
      title: 'Delete this food?',
      message: (name: string) => `“${name}” will be removed from this day. This can't be undone.`,
      confirm: 'Delete',
      cancel: 'Cancel',
    },
  },
} as const;

/** Shown for ambiguous number formats such as "1,234" (never guessed as 1.234 or 1234). */
export const NUMBER_FORMAT_ERROR = "Check number format. Use one decimal separator. Thousands separators aren't supported.";

export const FIELD_ERRORS: Readonly<Record<FoodEntryField, Partial<Record<FoodEntryProblem, string>>>> = {
  name: { required: 'Enter a food name.', 'too-long': 'Use 80 characters or fewer.' },
  quantity: {
    required: 'Enter a quantity.',
    'not-positive': 'Enter a quantity above 0.',
    'not-a-number': 'Enter a number, like 150 or 1.5.',
    'too-large': 'Enter 10,000 or less.',
  },
  unit: { 'invalid-option': 'Choose a unit.' },
  meal: { 'invalid-option': 'Choose a meal.' },
  calories: {
    required: 'Enter calories (0 is fine).',
    negative: 'Calories can’t be negative.',
    'not-a-number': 'Enter a number, like 250 or 99.5.',
    'too-large': 'Enter 10,000 kcal or less.',
  },
  proteinGrams: {
    required: 'Enter protein (0 is fine).',
    negative: 'Protein can’t be negative.',
    'not-a-number': 'Enter a number, like 12 or 3.5.',
    'too-large': 'Enter 1,000 g or less.',
  },
  carbohydrateGrams: {
    required: 'Enter carbohydrates (0 is fine).',
    negative: 'Carbohydrates can’t be negative.',
    'not-a-number': 'Enter a number, like 12 or 3.5.',
    'too-large': 'Enter 1,000 g or less.',
  },
  fatGrams: {
    required: 'Enter fat (0 is fine).',
    negative: 'Fat can’t be negative.',
    'not-a-number': 'Enter a number, like 12 or 3.5.',
    'too-large': 'Enter 1,000 g or less.',
  },
};
