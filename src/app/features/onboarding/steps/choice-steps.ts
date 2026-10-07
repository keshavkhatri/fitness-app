import {
  ACTIVITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  LOCATION_OPTIONS,
} from '../onboarding-content';
import { SingleChoiceStepConfig, defineChoiceStep } from './single-choice-step.component';

/** Configuration for every "pick one" onboarding step. Layout varies per step on purpose. */
export const CHOICE_STEPS = {
  goal: defineChoiceStep({
    stepId: 'goal',
    question: "What's your primary goal?",
    helper: 'Pick the one that matters most to you right now.',
    options: GOAL_OPTIONS,
    read: (draft) => draft.primaryGoal,
    change: (primaryGoal) => ({ primaryGoal }),
  }),
  experience: defineChoiceStep({
    stepId: 'experience',
    question: 'How would you describe your training experience?',
    options: EXPERIENCE_OPTIONS,
    read: (draft) => draft.trainingExperience,
    change: (trainingExperience) => ({ trainingExperience }),
  }),
  frequency: defineChoiceStep({
    stepId: 'frequency',
    question: 'How often do you want to train?',
    helper: 'Days per week. Choose what you can realistically keep up.',
    options: FREQUENCY_OPTIONS,
    layout: 'grid',
    columns: 3,
    read: (draft) => draft.trainingDaysPerWeek,
    change: (trainingDaysPerWeek) => ({ trainingDaysPerWeek }),
  }),
  location: defineChoiceStep({
    stepId: 'location',
    question: 'Where do you train?',
    options: LOCATION_OPTIONS,
    layout: 'grid',
    columns: 3,
    read: (draft) => draft.trainingLocation,
    change: (trainingLocation) => ({ trainingLocation }),
  }),
  activity: defineChoiceStep({
    stepId: 'activity',
    question: 'How active are you outside your workouts?',
    options: ACTIVITY_OPTIONS,
    read: (draft) => draft.activityLevel,
    change: (activityLevel) => ({ activityLevel }),
  }),
} satisfies Record<string, SingleChoiceStepConfig>;
