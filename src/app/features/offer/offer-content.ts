import { BillingProduct } from '../../core/entitlements/billing';

/**
 * Plan screen copy. Every Pro line is something Pro really unlocks today (see access-policy.ts); the
 * mockup's "advanced programming / priority support" lines are not shown because those features don't exist.
 */
export const OFFER_COPY = {
  title: 'Unlock Your Full Potential',
  lead: 'Get your personal workout plan, nutrition targets and progress tracking free, and build your own plan with StokeForm Pro.',
  mostPopular: 'Most Popular',
  free: 'Free',
  pro: 'Pro',
  freeList: ['Generated workout plans', 'Exercise library', 'Track your progress', 'Nutrition & habit tracker'],
  proList: ['Custom workout plan editor', 'Pick from the exercise library', 'Your own sets, reps and rest', 'Everything in Free'],
  goPro: {
    title: 'Go Pro',
    lead: 'Take your training to the next level with a plan you build yourself.',
    features: [
      { icon: 'create-outline', title: 'Custom workout plan editor', text: 'Build your own plan or modify your generated one.' },
      { icon: 'barbell-outline', title: 'The whole exercise library', text: 'Choose from every exercise, with photos and guides.' },
      { icon: 'options-outline', title: 'Your sets, reps and rest', text: 'Set each exercise the way you like to train.' },
      { icon: 'checkmark-done-outline', title: 'Everything in Free', text: 'Tracking, nutrition, progress and reviews stay included.' },
    ],
    cancelAnytime: 'Cancel anytime',
    subscribe: 'Subscribe',
    restore: 'Restore purchases',
    notLive: "Subscriptions aren't live in this build yet, so nothing can be bought or charged.",
  },
  promo: {
    title: 'Have a promo code?',
    text: 'Enter code to get Pro access for free (private testing).',
    placeholder: 'Enter promo code',
    apply: 'Apply',
  },
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
  continue: 'Continue',
  continueFree: 'Continue with Free',
  continuePro: 'Continue with Pro',
} as const;

/**
 * TODO(billing): the price must come from the store (RevenueCat → Google Play) before release. While no
 * products are configured (development), the plan screen shows this static monthly price as a preview;
 * Subscribe then explains that subscriptions aren't live and charges nothing.
 */
export const PREVIEW_PRODUCT: BillingProduct = { id: 'preview-pro-monthly', title: 'Pro', price: '₹299', period: 'month', trial: null };
