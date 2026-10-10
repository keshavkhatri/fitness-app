import { BodyCompositionMetric } from '../../domain/body-composition';

/** User-facing copy for body composition. Labels only: no reference ranges or interpretation. */
export const BODY_COMPOSITION_COPY = {
  metrics: {
    weight: 'Weight',
    'body-fat-mass': 'Body fat mass',
    'lean-body-mass': 'Lean body mass',
    'body-fat-percentage': 'Body fat percentage',
  } satisfies Record<BodyCompositionMetric, string>,

  history: {
    title: 'Body composition',
    back: 'You',
    intro: 'Values from your InBody reports, as recorded. Separate from your weight history, measurements and profile.',
    entry: { title: 'Body composition', description: 'Your recorded InBody assessments' },
    loading: 'Loading your body composition',
    add: 'Add assessment',
    latest: {
      title: 'Latest',
      notRecorded: 'Not recorded yet',
      /** `difference` is null when the two reports show the same value. A difference between reports, not progress. */
      change: (difference: string | null, previousDate: string) =>
        difference === null ? `No change since ${previousDate}` : `${difference} since ${previousDate}`,
      /** Reported values are never converted, so readings in different units aren't compared. */
      differentUnits: (previousDate: string) => `Not compared with ${previousDate} (different units)`,
    },
    list: { title: 'Assessments' },
    sources: {
      manual: 'Entered by hand',
      import: 'Imported',
    } satisfies Record<'manual' | 'import', string>,
    unsupported: (count: number) =>
      count === 1
        ? '1 saved assessment can’t be shown because it contains details this version of the app doesn’t support. It has been kept exactly as it is.'
        : `${count} saved assessments can’t be shown because they contain details this version of the app doesn’t support. They have been kept exactly as they are.`,
    empty: {
      title: 'No assessments yet',
      message: 'Add the values from an InBody report to start your history.',
    },
    error: {
      title: "Your body composition can't be read right now",
      message: 'Something went wrong while reading your saved assessments. Nothing has been changed or deleted.',
      retry: 'Try again',
    },
  },

  form: {
    title: 'Add body composition',
    back: 'Body composition',
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
    backToHistory: 'Back to Body composition',
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
