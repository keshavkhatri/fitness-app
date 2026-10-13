/** User-facing copy for the Calorie Check-in: plain, specific, honest about uncertainty. */
export const CHECK_IN_COPY = {
  title: 'Calorie check-in',
  back: 'Back',
  loading: 'Loading your calorie check-in',
  entry: 'Calorie check-in',
  intro: 'Compares what you logged with how your weight changed over the same 4 weeks.',

  observed: {
    title: 'What you recorded',
    intake: 'Average logged intake',
    weight: 'Weight trend',
    target: 'Current calorie target',
    noTarget: 'Not available',
  },

  estimate: {
    title: 'Estimated maintenance',
    label: 'Estimated maintenance calories',
    how: 'How this is calculated',
    caveat:
      'An estimate, not a measurement. Weight also moves with water, glycogen and food in your gut, and logged food is often a little incomplete, so the true figure can sit anywhere in the range.',
    insufficientTitle: 'Not enough data for an estimate yet',
    implausibleTitle: 'These numbers don’t add up yet',
  },

  recommendation: {
    title: 'Your calorie target',
    review: 'Review change',
    keep: 'Keep current target',
    kept: 'Kept your current target. Nothing was changed.',
  },

  links: { logFood: 'Log food', logWeight: 'Log weight', weightHistory: 'Weight history' },

  formula: {
    action: 'Use the calculated target instead',
    title: 'Use the calculated target?',
    confirm: 'Use calculated target',
  },

  confirm: {
    title: 'Change your calorie target?',
    current: 'Current target',
    next: 'New target',
    macros: 'New daily macros',
    noMacros: 'Macro targets stay on hold (they can’t be met at this calorie level).',
    consequences:
      'Saved to your profile and used for your targets on Nutrition and Home. Your food log, weight history and workout plan aren’t changed. You can switch back to the calculated target at any time.',
    accept: 'Change target',
    cancel: 'Cancel',
    saving: 'Saving',
    failed: 'Couldn’t save the change. Nothing was changed; try again.',
    changed: 'Your data changed since this was shown, so nothing was saved. Here is the updated check-in.',
    saved: (kcal: string) => `Your calorie target is now ${kcal} kcal a day.`,
    formulaSaved: 'Your calorie target is calculated from your profile again.',
  },

  error: {
    title: 'We couldn’t load your check-in',
    message: 'Something went wrong while reading your food log or weight history. Nothing has been changed.',
    retry: 'Try again',
  },
} as const;
