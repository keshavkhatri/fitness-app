import {
  ACTIVITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_CARD_OPTIONS,
  LOCATION_CARD_OPTIONS,
} from '../onboarding-content';
import { SingleChoiceStepConfig, defineChoiceStep } from './single-choice-step.component';

/** Configuration for every "pick one" onboarding step. Layout varies per step on purpose. */
export const CHOICE_STEPS = {
  activity: defineChoiceStep({
    stepId: 'activity',
    question: 'How active are you outside your workouts?',
    helper: 'This helps estimate how much energy you use in a day.',
    options: ACTIVITY_OPTIONS,
    read: (draft) => draft.activityLevel,
    change: (activityLevel) => ({ activityLevel }),
  }),
  goal: defineChoiceStep({
    stepId: 'goal',
    question: "What's your main goal?",
    helper: 'Choose the one that matters most right now. Your plan is built around it.',
    options: GOAL_CARD_OPTIONS,
    read: (draft) => draft.primaryGoal,
    change: (primaryGoal) => ({ primaryGoal }),
  }),
  experience: defineChoiceStep({
    stepId: 'experience',
    question: 'How would you describe your training experience?',
    helper: 'Your plan starts at a level that suits you.',
    options: EXPERIENCE_OPTIONS,
    read: (draft) => draft.trainingExperience,
    change: (trainingExperience) => ({ trainingExperience }),
  }),
  frequency: defineChoiceStep({
    stepId: 'frequency',
    question: 'How many days per week can you train?',
    helper: 'Your plan is built for exactly this many days.',
    options: FREQUENCY_OPTIONS,
    layout: 'circles',
    note: {
      icon: 'bulb-outline',
      title: 'Choose what you can keep up',
      text: 'A schedule you can stick to beats an ambitious one. You can change it later in your profile.',
    },
    read: (draft) => draft.trainingDaysPerWeek,
    change: (trainingDaysPerWeek) => ({ trainingDaysPerWeek }),
  }),
  location: defineChoiceStep({
    stepId: 'location',
    question: 'Where do you work out?',
    helper: 'Choose the option that best matches your setup.',
    options: LOCATION_CARD_OPTIONS,
    read: (draft) => draft.trainingLocation,
    change: (trainingLocation) => ({ trainingLocation }),
  }),
} satisfies Record<string, SingleChoiceStepConfig>;
