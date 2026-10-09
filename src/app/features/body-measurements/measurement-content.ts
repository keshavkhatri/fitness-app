import { MeasurementSite } from '../../domain/body-measurements';

/** User-facing copy for body measurements. */
export const MEASUREMENT_COPY = {
  sites: {
    waist: 'Waist',
    chest: 'Chest',
    hips: 'Hips',
    arm: 'Arm',
    thigh: 'Thigh',
  } satisfies Record<MeasurementSite, string>,

  history: {
    title: 'Measurements',
    back: 'You',
    intro: 'A record of your tape measurements. Separate from your weight history and profile.',
    entry: { title: 'Measurements', description: 'Your recorded body measurements' },
    loading: 'Loading your measurements',
    add: 'Add measurements',
    latest: {
      title: 'Latest',
      notMeasured: 'Not measured yet',
      /** `difference` is null when the two readings show the same value. */
      change: (difference: string | null, previousDate: string) =>
        difference === null ? `No change since ${previousDate}` : `${difference} since ${previousDate}`,
    },
    list: {
      title: 'History',
      edit: 'Edit measurements from',
    },
    unsupported: (count: number) =>
      count === 1
        ? '1 saved entry can’t be shown because it contains measurements this version of the app doesn’t support. It has been kept exactly as it is.'
        : `${count} saved entries can’t be shown because they contain measurements this version of the app doesn’t support. They have been kept exactly as they are.`,
    empty: {
      title: 'No measurements yet',
      message: 'Add your first measurements to start your history.',
    },
    error: {
      title: "Your measurements can't be read right now",
      message: 'Something went wrong while reading your saved measurements. Nothing has been changed or deleted.',
      retry: 'Try again',
    },
  },

  form: {
    addTitle: 'Add measurements',
    editTitle: 'Edit measurements',
    back: 'Measurements',
    intro: 'Fill in the measurements you took. Leave the rest blank.',
    separateNote: 'Saved to your measurements only. Your profile and weight history stay the same.',
    legend: 'Measurements',
    hints: {
      arm: 'One arm only. Measure the same arm each time.',
      thigh: 'One thigh only. Measure the same thigh each time.',
    } satisfies Partial<Record<MeasurementSite, string>>,
    date: 'Date',
    dateHint: 'The day you took these measurements.',
    save: 'Save',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    fixErrors: 'Check the highlighted fields.',
    saveFailed: "Your measurements couldn't be saved, so nothing was changed. Please try again.",
    loadingEntry: 'Loading measurements',
    notFound: { title: 'Entry not found', message: 'These measurements may already have been deleted.' },
    unsupported: {
      title: 'This entry can’t be shown',
      message: 'It contains measurements this version of the app doesn’t support. It has been kept exactly as it is, and nothing was changed.',
    },
    loadFailed: {
      title: "Your measurements can't be read right now",
      message: "Your saved measurements couldn't be read, so measurements can't be saved at the moment. Nothing has been changed or deleted.",
      retry: 'Try again',
    },
    backToHistory: 'Back to Measurements',
    errors: {
      required: 'Enter at least one measurement.',
      number: (site: string) => `Enter your ${site.toLowerCase()} as a number, like 80.5.`,
      range: (site: string, range: string) => `Enter a ${site.toLowerCase()} measurement between ${range}.`,
      dateRequired: 'Choose the date you took these measurements.',
      dateInvalid: 'Enter a valid date.',
      dateFuture: "The date can't be in the future.",
    },
  },
} as const;
