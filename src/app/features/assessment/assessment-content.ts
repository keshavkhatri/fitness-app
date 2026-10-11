import { ConfidenceLevel } from '../../domain/fitness-calculations';
import { PrimaryGoal } from '../../domain/fitness-profile';

/**
 * User-facing copy for the assessment screen. Deliberately plain language:
 * estimates and starting targets, never measurements or medical advice, and
 * no implementation terms (equations, multipliers, thresholds, BMI).
 */

export const GOAL_LABELS: Readonly<Record<PrimaryGoal, string>> = {
  'lose-fat': 'Lose fat',
  'build-muscle': 'Build muscle',
  recomposition: 'Recompose',
  'get-stronger': 'Build strength',
  'improve-fitness': 'Improve general fitness',
};

export const ASSESSMENT_COPY = {
  title: 'Your starting point',
  intro: "Based on the information you shared, here's your initial fitness profile.",

  energy: {
    targetLabel: 'Starting calorie target',
    targetCaption: 'Your initial daily target',
    bmrLabel: 'Estimated BMR',
    bmrCaption: 'Estimated calories your body uses at rest',
    maintenanceLabel: 'Estimated maintenance',
    maintenanceCaption: 'Estimated daily energy needs at your activity level',
    maintenanceFromCheckIn: (date: string) => `From your calorie check-in on ${date}: your logged intake compared with your weight trend`,
  },

  why: [
    "These are starting estimates based on the information you provided. We'll refine them as we learn from your real progress.",
    'Your targets are based on your goal, age, body measurements and everyday activity level.',
    'Your protein target is set to support your goal and training.',
  ],

  notices: {
    calorieAdjusted: {
      title: 'A steadier starting target',
      message:
        'Your starting target is a little less aggressive than your goal alone would suggest, to give you a sustainable place to begin.',
    },
    calorieReview: {
      title: 'Your numbers need a second look',
      message:
        "Based on the information provided, we couldn't establish a typical starting calorie target with enough confidence. Please review your profile details before using this target.",
    },
    macrosOnHold: {
      title: 'Macro targets are on hold',
      message: 'Your macro targets will appear once your starting calorie target is confirmed.',
    },
    macrosConstrained: {
      title: 'Macro balance needs review',
      message:
        'Your calorie target leaves limited room for all three macro targets. These numbers are a constrained starting point.',
    },
    macrosInfeasible: {
      title: "We couldn't create a balanced macro target",
      message:
        "Your current calorie and protein targets don't leave enough room for the minimum fat target. Review your goal or profile details to continue.",
    },
    incomplete: {
      title: 'We need a few more details',
      message: 'Your fitness profile is incomplete. Please review your details.',
    },
    error: {
      title: "We couldn't load your starting point",
      message: 'Something went wrong while preparing your estimates. Please try again.',
    },
  },

  actions: {
    continue: 'Continue',
    review: 'Review my details',
    continueAnyway: 'Continue for now',
    retry: 'Try again',
  },
} as const;

/**
 * Formula-only estimates are moderate (or low). "High" is reserved for future
 * measurement-backed methods and is deliberately never shown today.
 */
export const CONFIDENCE_COPY: Readonly<Record<Exclude<ConfidenceLevel, 'high'>, { label: string; description: string }>> = {
  moderate: {
    label: 'Moderate',
    description: 'These are formula-based estimates using the information you provided.',
  },
  low: {
    label: 'Low',
    description:
      "Some details weren't provided, so these estimates are less precise and your real needs may differ more than usual. They'll improve as we learn from your progress.",
  },
};
