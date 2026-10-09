/** User-facing copy for body-weight history. */
export const WEIGHT_HISTORY_COPY = {
  title: 'Body weight',
  back: 'You',
  intro: 'A record of your weigh-ins. Adding one here doesn’t change the weight in your profile.',
  loading: 'Loading your weight history',
  add: 'Add weight',
  entry: { title: 'Body weight', description: 'Your recorded weigh-ins' },

  list: {
    title: 'History',
    firstEntry: 'First entry',
    noChange: 'No change since previous entry',
    sincePrevious: 'since previous entry',
    sameDay: 'since previous entry (same day)',
    edit: 'Edit',
  },

  trend: {
    title: 'Over time',
    rangeLegend: 'Time range',
    ranges: { '30d': '30 days', '90d': '90 days', all: 'All time' },
    rangeNames: { '30d': 'the last 30 days', '90d': 'the last 90 days', all: 'all time' },
    today: 'Today',
    first: 'First',
    latest: 'Latest',
    change: 'Change',
    changeCaption: 'Between first and latest recorded measurements',
    singleCaption: 'Only one measurement in this range, so there’s no change to show yet.',
    noChange: 'No change',
    measurementsLabel: 'Measurements in this range',
    chartUnavailable: 'The chart can’t be shown right now. Your measurements are listed below.',
    emptyRange: (rangeName: string) => `No weigh-ins in ${rangeName}`,
    emptyRangeMessage: 'Add a weigh-in, or choose a longer range.',
    describeOne: (rangeName: string, weight: string, date: string) => `Weight chart for ${rangeName}: one measurement, ${weight} (${date}).`,
    describeMany: (rangeName: string, count: number, first: string, firstDate: string, latest: string, latestDate: string, change: string) =>
      `Weight chart for ${rangeName}: ${count} measurements, from ${first} (${firstDate}) to ${latest} (${latestDate}). Change between first and latest recorded measurements: ${change}.`,
  },

  empty: {
    title: 'No weigh-ins yet',
    message: 'Add your first weight to start your history.',
  },

  error: {
    title: "We couldn't load your weight history",
    message: 'Something went wrong while reading your saved weigh-ins. Nothing has been changed.',
    retry: 'Try again',
  },

  form: {
    addTitle: 'Add weight',
    editTitle: 'Edit weight',
    back: 'Body weight',
    weight: 'Weight',
    weightHint: 'Saved to your history only. Your profile weight stays the same.',
    date: 'Date',
    dateHint: 'The day you weighed yourself.',
    save: 'Save',
    saveChanges: 'Save changes',
    delete: 'Delete entry',
    fixErrors: 'Check the highlighted fields.',
    saveFailed: "Your weight couldn't be saved. Please try again.",
    deleteFailed: "This entry couldn't be deleted. Please try again.",
    loadingEntry: 'Loading entry',
    notFound: { title: 'Entry not found', message: 'This weigh-in may already have been deleted.' },
    loadFailed: { title: "We couldn't load this entry", message: 'Something went wrong while reading your weight history.', retry: 'Try again' },
    backToHistory: 'Back to Body weight',
    deleteConfirm: {
      title: 'Delete this weigh-in?',
      message: (summary: string) => `“${summary}” will be removed from your history. This can't be undone.`,
      confirm: 'Delete',
      cancel: 'Cancel',
    },
    errors: {
      weightRequired: 'Enter your weight.',
      weightNumber: 'Enter your weight as a number, like 80.4.',
      weightRange: (range: string) => `Enter a weight between ${range}.`,
      dateRequired: 'Choose the date you weighed yourself.',
      dateInvalid: 'Enter a valid date.',
      dateFuture: "The date can't be in the future.",
    },
  },
} as const;
