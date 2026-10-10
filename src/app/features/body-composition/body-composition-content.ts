import { BodyCompositionMetric } from '../../domain/body-composition';

/** User-facing copy for body composition. Labels only: no reference ranges or interpretation. */
export const BODY_COMPOSITION_COPY = {
  metrics: {
    weight: 'Weight',
    'body-fat-mass': 'Body fat mass',
    'lean-body-mass': 'Lean body mass',
    'body-fat-percentage': 'Body fat percentage',
  } satisfies Record<BodyCompositionMetric, string>,

  form: {
    title: 'Add body composition',
    back: 'You',
    intro: 'Type in the values from your InBody report, exactly as printed. Leave out any your report doesn’t show.',
    separateNote: 'Saved to your body composition only. Your profile, weight history and measurements stay the same.',
    legend: 'Report values',
    massUnit: 'Mass unit on your report',
    massUnitHint: 'Weight, body fat mass and lean body mass are saved in this unit, without converting.',
    date: 'Date',
    dateHint: 'The day of the assessment.',
    save: 'Save',
    cancel: 'Cancel',
    fixErrors: 'Check the highlighted fields.',
    saveFailed: "Your assessment couldn't be saved, so nothing was changed. Please try again.",
    loading: 'Loading',
    loadFailed: {
      title: "Your body composition can't be read right now",
      message: "Your saved assessments couldn't be read, so a new one can't be saved at the moment. Nothing has been changed or deleted.",
      retry: 'Try again',
    },
    backToYou: 'Back to You',
    errors: {
      required: 'Enter at least one value from your report.',
      number: (metric: string) => `Enter ${metric.toLowerCase()} as a number, like 22.4.`,
      weightRange: (range: string) => `Enter a weight between ${range}.`,
      massRange: (metric: string, max: string) => `Enter a ${metric.toLowerCase()} above 0 and up to ${max}.`,
      percentageRange: 'Enter a body fat percentage above 0 and below 100.',
      dateRequired: 'Choose the date of the assessment.',
      dateInvalid: 'Enter a valid date.',
      dateFuture: "The date can't be in the future.",
    },
  },
} as const;
