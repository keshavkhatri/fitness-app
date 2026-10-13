import { PrimaryGoal, TrainingExperience } from '../../domain/fitness-profile';
import {
  ActivityDayType,
  ActivityKind,
  MuscleGroup,
  ProgramStyle,
  SessionType,
  WorkoutEquipment,
  WorkoutLocation,
} from '../../domain/workout-programming';

/**
 * User-facing copy and labels for the Workout screen. The engine speaks in
 * codes; everything a user reads is phrased here.
 */

export const SESSION_TITLES: Readonly<Record<SessionType, string>> = {
  'full-body': 'Full Body',
  upper: 'Upper Body',
  lower: 'Lower Body',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
};

export const ACTIVITY_TITLES: Readonly<Record<ActivityDayType, string>> = {
  'light-activity': 'Light Activity',
  'optional-conditioning': 'Optional Conditioning',
};

export const ACTIVITY_LABELS: Readonly<Record<ActivityKind, string>> = {
  walking: 'walking',
  'easy-cycling': 'easy cycling',
  mobility: 'mobility work',
  'light-conditioning': 'light conditioning',
};

export const STYLE_DESCRIPTORS: Readonly<Record<ProgramStyle, string>> = {
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
  general: 'General fitness',
};

export const GOAL_LABELS: Readonly<Record<PrimaryGoal, string>> = {
  'lose-fat': 'Lose fat',
  'build-muscle': 'Build muscle',
  recomposition: 'Recompose',
  'get-stronger': 'Build strength',
  'improve-fitness': 'Improve general fitness',
};

export const EXPERIENCE_LABELS: Readonly<Record<TrainingExperience, string>> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const LOCATION_LABELS: Readonly<Record<WorkoutLocation, string>> = {
  gym: 'Gym',
  home: 'Home',
  outdoor: 'Outdoors',
};

export const MUSCLE_LABELS: Readonly<Record<MuscleGroup, string>> = {
  chest: 'Chest',
  lats: 'Lats',
  'upper-back': 'Upper back',
  'front-delts': 'Front delts',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
  abs: 'Abs',
  obliques: 'Obliques',
  'lower-back': 'Lower back',
  cardiovascular: 'Conditioning',
};

/** Broad body areas for a session's focus line ("Chest · Back · Shoulders · Arms"). */
export const MUSCLE_AREAS: Readonly<Record<MuscleGroup, string>> = {
  chest: 'Chest',
  lats: 'Back',
  'upper-back': 'Back',
  'front-delts': 'Shoulders',
  'side-delts': 'Shoulders',
  'rear-delts': 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  quads: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Glutes',
  adductors: 'Legs',
  calves: 'Legs',
  abs: 'Core',
  obliques: 'Core',
  'lower-back': 'Core',
  cardiovascular: 'Conditioning',
};

export const EQUIPMENT_LABELS: Readonly<Record<WorkoutEquipment, string>> = {
  dumbbells: 'Dumbbells',
  barbell: 'Barbell',
  rack: 'Rack',
  bench: 'Bench',
  cable: 'Cable',
  machine: 'Machine',
  'resistance-band': 'Band',
  'pull-up-bar': 'Pull-up bar',
  'ab-wheel': 'Ab wheel',
};

/** Monday-first, matching the weekly layout. */
export const WEEKDAYS = [
  { key: 'mon', name: 'Monday', short: 'Mon' },
  { key: 'tue', name: 'Tuesday', short: 'Tue' },
  { key: 'wed', name: 'Wednesday', short: 'Wed' },
  { key: 'thu', name: 'Thursday', short: 'Thu' },
  { key: 'fri', name: 'Friday', short: 'Fri' },
  { key: 'sat', name: 'Saturday', short: 'Sat' },
  { key: 'sun', name: 'Sunday', short: 'Sun' },
] as const;

export const WORKOUT_COPY = {
  title: 'Workout',
  subtitle: 'Your training plan',
  loading: 'Loading your training plan',

  today: {
    workoutEyebrow: "Today's workout",
    activityEyebrow: "Today's activity",
    restEyebrow: 'Today',
    viewWorkout: 'View Workout',
    viewActivity: 'View Activity',
    restTitle: 'Rest Day',
    restMessage: 'Recovery is part of your plan. Rest, move gently and come back fresh.',
    preview: (title: string) => `Preview ${title}`,
    upNext: (title: string, weekday: string) => `Next up: ${title} on ${weekday}.`,
  },

  activity: {
    recoveryLabel: 'Recovery',
    optionalLabel: 'Optional',
    optional: 'Optional: skip it if you need more rest.',
    pace: 'Keep the pace easy: you should be able to hold a conversation.',
  },

  week: {
    title: 'This week',
    caption: 'Your sessions spread across the week, with rest days in between.',
    today: 'Today',
    rest: 'Rest',
  },

  exercises: {
    title: "Today's exercises",
    substitute: 'Closest option for your equipment',
  },

  detail: {
    pageTitle: 'Workout',
    back: 'Back',
    today: 'Today',
    exercisesTitle: 'Exercises',
    progressionTitle: 'Progression',
    bodyweight: 'Bodyweight',
    substitution: {
      title: 'Modified exercise',
      message: 'A substitute chosen for your available equipment.',
    },
    startWorkout: 'Start Workout',
    resumeWorkout: 'Resume Workout',
    startFailed: "We couldn't start this workout. Please try again.",
    conflict: {
      title: 'Another workout is in progress',
      message: (title: string) => `${title} is still in progress. Resume it, or discard it to start this workout.`,
      resume: (title: string) => `Resume ${title}`,
      replace: 'Discard and Start',
      cancel: 'Cancel',
    },
    startActivity: 'Start Activity',
    activityPending: 'Activity tracking arrives in a later update. Nothing has been started or recorded.',
    activityTitle: 'What to do',
    easyPace: 'Easy pace',
    restMessage: 'Recovery is part of your plan. There is no workout scheduled for this day.',
    backToWorkout: 'Back to Workout',
    loading: 'Loading workout',
    notFound: {
      title: 'Workout not found',
      message: 'This session is no longer available in your current plan.',
    },
    unavailable: {
      title: "Couldn't load this workout",
      message: 'Something went wrong while loading this session. Please try again.',
      retry: 'Try Again',
    },
    progression: {
      loaded: (percent: number) =>
        `Loaded exercises: once you complete every set at the top of the rep range, increase the load by about ${percent}%.`,
      reps: (name: string, upper: number, next: string | null) =>
        `${name}: once you reach ${upper} reps on every set, move on to ${next ?? 'a harder variation'}.`,
      time: (name: string, increment: number, max: number, next: string | null) =>
        `${name}: add ${increment} sec each session, up to ${max} sec${next ? `, then move on to ${next}` : ''}.`,
    },
  },

  resume: {
    eyebrow: 'Workout in progress',
    progress: (done: number, total: number) => `${done} of ${total} sets done`,
    action: 'Resume Workout',
  },

  active: {
    exit: 'Exit workout',
    more: 'More workout options',
    currentSet: 'Current set',
    howTo: 'How to do it',
    workoutTime: 'Workout time',
    previousShort: 'Previous exercise',
    nextUp: 'Next up',
    lastExercise: 'Last exercise',
    lastExerciseHint: 'Finish when every set is done',
    nextUpLabel: (name: string) => `Next exercise: ${name}`,
    menu: { title: 'Workout options' },
    leaveWorkout: 'Leave Workout',
    progressLabel: 'Workout progress',
    exerciseOf: (n: number, total: number) => `Exercise ${n} of ${total}`,
    progressText: (exercise: number, total: number, done: number, sets: number) =>
      `Exercise ${exercise} of ${total}. ${done} of ${sets} sets done.`,
    planned: 'Planned',
    set: (n: number) => `Set ${n}`,
    columns: { set: 'Set', weight: 'Weight', reps: 'Reps', repsPerSide: 'Reps / side', time: 'Seconds', timePerSide: 'Sec / side' },
    completeSet: (n: number) => `Complete set ${n}`,
    completeSetShort: 'Complete set',
    undoSet: (n: number, values: string) => `Set ${n} done: ${values}. Undo`,
    undoSkip: (n: number) => `Set ${n} skipped. Undo`,
    done: 'Done',
    skipped: 'Skipped',
    skipSet: (n: number) => `Skip set ${n}`,
    skipExercise: 'Skip exercise',
    previous: 'Previous',
    previousLabel: 'Previous exercise',
    next: 'Next Exercise',
    finish: 'Finish Workout',
    setCompleted: (n: number) => `Set ${n} completed.`,
    setSkipped: (n: number) => `Set ${n} skipped.`,
    allSetsDone: 'All sets done for this exercise.',
    notSaved: {
      title: "Progress isn't being saved",
      message: "We couldn't save your latest sets on this device. Keep this screen open until you finish.",
    },
    noWorkout: {
      title: 'No workout in progress',
      message: 'This workout has not been started, or it has already finished.',
    },
    loading: 'Loading workout',
    rest: {
      title: 'Rest time',
      start: 'Start rest',
      planned: (time: string) => `Rest, ${time} planned`,
      skipShort: 'Skip',
      pause: 'Pause',
      resume: 'Resume',
      restart: 'Restart',
      skip: 'Skip Rest',
      dismiss: 'Dismiss',
      complete: 'Rest complete. Ready for your next set.',
      completeTitle: 'Rest complete',
      remaining: (time: string) => `${time} remaining`,
    },
    dialogs: {
      skipExercise: {
        title: 'Skip this exercise?',
        message: 'Your completed sets will be kept.',
        confirm: 'Skip Exercise',
        cancel: 'Cancel',
      },
      leaveIncomplete: {
        title: 'Move to the next exercise?',
        message: (n: number) =>
          `${n === 1 ? '1 set is' : `${n} sets are`} not done yet. You can come back to ${n === 1 ? 'it' : 'them'} before finishing.`,
        confirm: 'Next Exercise',
        cancel: 'Stay',
      },
      finish: {
        title: 'Finish workout?',
        incomplete: (n: number) => `You have ${n === 1 ? '1 incomplete set' : `${n} incomplete sets`}.`,
        complete: 'Every set is done. Nice work.',
        confirm: 'Finish Workout',
        confirmAnyway: 'Finish Anyway',
        cancel: 'Keep Working',
      },
      exit: {
        title: 'Leave this workout?',
        message: 'Your progress is kept. You can resume it from Workout.',
        leave: 'Leave for Now',
        discard: 'Discard Workout',
        cancel: 'Keep Working',
      },
      discard: {
        title: 'Discard this workout?',
        message: 'Sets you logged in this workout will be deleted.',
        confirm: 'Discard Workout',
        cancel: 'Keep Workout',
      },
    },
    errors: {
      weight: 'Enter the weight you used.',
      reps: 'Enter the reps you completed.',
      durationSeconds: 'Enter the time in seconds.',
      generic: "That set couldn't be saved. Please try again.",
    },
  },

  history: {
    title: 'Workout History',
    back: 'Back',
    loading: 'Loading workout history',
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    thisMonth: 'This month',
    workouts: (n: number) => (n === 1 ? '1 workout' : `${n} workouts`),
    consistencyLabel: 'Training consistency',
    exercises: (done: number, total: number) => `${done} of ${total} exercises`,
    sets: (n: number) => (n === 1 ? '1 set' : `${n} sets`),
    completed: 'Completed',
    partial: (done: number, total: number) => `Finished · ${done}/${total} sets`,
    skippedCount: (n: number) => `${n} skipped`,
    empty: {
      title: 'No completed workouts yet',
      message: 'Complete your first workout and your history will appear here.',
      action: 'View Workout',
    },
    error: {
      title: "Couldn't load workout history",
      message: 'Something went wrong while reading your workouts. Please try again.',
      retry: 'Try Again',
    },
    recent: {
      title: 'Recent workouts',
      empty: 'Workouts you finish will appear here.',
      viewAll: 'View History',
    },
    detail: {
      completedAt: 'Completed',
      exercisesTitle: 'Exercises',
      planned: 'Planned',
      actual: 'Actual',
      actualSets: (name: string) => `${name}, actual sets`,
      skipped: 'Skipped',
      notDone: 'Not done',
      allSetsDone: 'All sets done',
      setsDone: (done: number, total: number) => `${done} of ${total} sets done`,
      notFound: {
        title: 'Workout not found',
        message: "We couldn't find this workout in your history.",
        action: 'Back to History',
      },
    },
  },

  demo: {
    show: 'Show demonstration',
    hide: 'Hide demonstration',
    play: 'Play',
    pause: 'Pause',
    alt: (name: string) => `${name}: start and end positions, shown in turn`,
    failed: "The demonstration couldn't be loaded. Check your connection and try again.",
    retry: 'Try again',
  },
  progress: {
    title: 'Progress',
    subtitle: 'Your training over time',
    back: 'Back',
    entry: { title: 'Progress', description: 'Training activity and performance' },
    body: { title: 'Body', composition: 'Body composition', description: 'Your InBody assessments and the changes between them.' },
    loading: 'Loading your progress',
    overview: { title: 'Overview', thisWeek: 'This week', thisMonth: 'This month', total: 'Total', workout: 'workout', workouts: 'workouts' },
    week: {
      title: 'Training this week',
      days: (name: string, count: number, upcoming: boolean) =>
        upcoming ? `${name}: upcoming` : count === 0 ? `${name}: no workout` : count === 1 ? `${name}: workout completed` : `${name}: ${count} workouts completed`,
      note: 'Rest days are part of training.',
    },
    activity: {
      title: 'Training activity',
      sets: 'Sets completed',
      time: 'Training time',
      last: 'Last workout',
      none: 'None yet',
    },
    recent: {
      title: 'Recent performance',
      latest: 'Latest',
      lastPerformed: (date: string) => `Last performed · ${date}`,
      viewAll: 'View all exercises',
      note: 'From sets you completed, not planned targets.',
    },
    exercises: { title: 'Exercises', subtitle: 'Every exercise you have logged, most recent first.' },
    detail: {
      latest: 'Latest performance',
      recentBest: 'Recent best',
      recentBestNote: (n: number) => (n === 1 ? 'Top set of your latest session' : `Top set across your last ${n} sessions`),
      sessionsTitle: 'Recent sessions',
      actualNote: 'Completed sets from your workouts. Planned targets are not shown here.',
      sets: (date: string) => `${date}, completed sets`,
      notFound: {
        title: 'No performance yet',
        message: "There are no completed sets for this exercise in your history.",
        action: 'Back to Progress',
      },
    },
    empty: {
      title: 'Your progress starts here',
      message: 'Complete your first workout to start seeing training activity and performance.',
      action: 'View Workout',
    },
    error: {
      title: "Couldn't load your progress",
      message: 'Something went wrong while reading your workouts. Please try again.',
      retry: 'Try Again',
    },
  },

  summary: {
    title: 'Workout Complete',
    partialTitle: 'Workout Finished',
    duration: 'Duration',
    exercises: 'Exercises',
    setsCompleted: 'Sets completed',
    setsSkipped: 'Sets skipped',
    setsIncomplete: 'Sets not done',
    exercisesValue: (done: number, total: number) => `${done} of ${total}`,
    statusComplete: 'Every set completed',
    statusPartial: 'Finished with some sets not completed',
    done: 'Done',
    notFound: {
      title: 'Summary unavailable',
      message: "We couldn't find this workout.",
    },
    loading: 'Loading summary',
  },

  plan: {
    title: 'Your plan',
    goal: 'Goal',
    days: 'Training days',
    experience: 'Experience',
    location: 'Location',
  },

  notices: {
    regenerated: {
      title: 'Your plan was updated',
      message: 'We rebuilt your plan to match the changes to your profile.',
    },
    notSaved: {
      title: "Your plan isn't saved on this device",
      message: "Everything below is ready to use. We'll recreate the same plan next time you open Workout.",
    },
  },

  noProfile: {
    title: 'Complete your profile',
    message: 'We need your fitness profile before we can create your training plan.',
    action: 'Set Up Profile',
  },

  unavailable: {
    title: "We couldn't create your plan",
    message: 'Something went wrong while preparing your training plan. Please try again, or review your profile.',
    retry: 'Try Again',
    review: 'Review Profile',
  },
} as const;
