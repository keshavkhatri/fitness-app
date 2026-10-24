/**
 * Plan screen copy. StokeForm launches free only: every line is something the app really does today, for
 * everyone (see access-policy.ts). Paid Pro copy comes back with subscriptions (docs/billing-launch-plan.md).
 */
export const OFFER_COPY = {
  title: 'Everything is free',
  lead: 'StokeForm is free to use. No subscription and no card needed.',
  features: [
    { icon: 'barbell-outline', title: 'Workout plans', text: 'A plan made for your goal, or build and edit your own.' },
    { icon: 'timer-outline', title: 'Guided workouts', text: 'Log your sets with a rest timer, and see your history and personal bests.' },
    { icon: 'nutrition-outline', title: 'Nutrition targets', text: 'Daily calorie and macro targets, with a food log.' },
    { icon: 'trending-up-outline', title: 'Progress tracking', text: 'Weight, measurements, body composition and weekly reviews.' },
  ],
  continueFree: 'Continue for free',
  /** The private-testing success screen (promo-success.component.ts), unused while everything is free. */
  success: {
    title: 'Pro Test Access Activated!',
    lead: 'You now have access to Pro features. This is for testing purposes only and not a real subscription.',
    badge: 'Test access',
    planName: 'Pro / Test Access',
    notSubscription: 'Not a subscription',
    turnOff: 'Turn off test access',
    yourPlan: 'Your Plan',
    planLine: 'Test Access, not a subscription',
    continue: 'Continue',
  },
} as const;
