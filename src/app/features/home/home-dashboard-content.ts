/**
 * Words for Home's "Mindset for today" card: one short quote and one practical tip a day, the same all day,
 * rotating through the lists below by calendar day. General advice only, never about the user's own numbers.
 */

export const MINDSET_QUOTES: readonly string[] = [
  'Small steps build big results.',
  'Progress, not perfection.',
  'Show up. The rest follows.',
  'Strong is built one rep at a time.',
  'Consistency beats intensity.',
  'Your only competition is yesterday.',
  'Rest is part of the plan.',
  'Discipline is choosing what you want most.',
  'A short workout beats no workout.',
  'Every meal is a fresh start.',
  'Trust the process. Track the progress.',
  'Good habits compound.',
  'Energy follows action.',
  'Be patient with results, not with effort.',
];

export interface DailyTip {
  /** "Training", "Nutrition", "Recovery", "Habits" */
  readonly topic: string;
  readonly title: string;
  readonly body: string;
}

export const DAILY_TIPS: readonly DailyTip[] = [
  {
    topic: 'Training',
    title: 'Add a little, often',
    body: 'When you finish every set at the top of your rep range with good form, add the smallest weight step next time. Small, steady increases add up over months.',
  },
  {
    topic: 'Nutrition',
    title: 'Protein at every meal',
    body: 'Spreading protein over three or four meals makes your daily target easier to reach than saving it for dinner. A palm-sized portion per meal is a good start.',
  },
  {
    topic: 'Recovery',
    title: 'Sleep is a training tool',
    body: 'Most adults recover best on 7–9 hours. A regular bedtime, a dark, cool room and no screens for the last half hour all help.',
  },
  {
    topic: 'Habits',
    title: 'Make the next step easy',
    body: 'Lay out your gym clothes the night before, or plan tomorrow’s meals tonight. The less you have to decide, the more often you follow through.',
  },
  {
    topic: 'Training',
    title: 'Warm up the movement',
    body: 'Before your first heavy exercise, do one or two lighter sets of the same lift. It prepares the exact muscles and joints you are about to load.',
  },
  {
    topic: 'Nutrition',
    title: 'Drink before you are thirsty',
    body: 'Keep water within reach and have a glass with each meal. By the time you feel thirsty, you are often already a little dehydrated.',
  },
  {
    topic: 'Recovery',
    title: 'Move on rest days',
    body: 'An easy walk or light mobility work on a rest day helps you feel less stiff and keeps your daily steps up, without tiring you for the next workout.',
  },
  {
    topic: 'Habits',
    title: 'Log it right away',
    body: 'Record food and workouts as they happen. Logging later relies on memory, and small things are easy to forget.',
  },
  {
    topic: 'Training',
    title: 'Control the way down',
    body: 'Lower the weight in about two to three seconds instead of letting it drop. It builds strength and keeps the movement safe.',
  },
  {
    topic: 'Nutrition',
    title: 'Fill half the plate with plants',
    body: 'Vegetables and fruit add volume and fibre for few calories, so meals keep you full for longer.',
  },
  {
    topic: 'Recovery',
    title: 'Listen to soreness',
    body: 'Mild soreness is normal and usually fades in a day or two. Sharp or joint pain is different: stop that exercise and get it checked if it persists.',
  },
  {
    topic: 'Habits',
    title: 'Weigh in the same way',
    body: 'Weigh yourself at the same time of day, ideally in the morning before eating. Look at the trend over weeks, not one day’s number.',
  },
];

/** The same quote and tip all day; the next ones tomorrow. `dayNumber` is days since 1970-01-01. */
export function mindsetFor(dayNumber: number): { readonly quote: string; readonly tip: DailyTip } {
  const index = Math.abs(Math.floor(dayNumber));
  return { quote: MINDSET_QUOTES[index % MINDSET_QUOTES.length], tip: DAILY_TIPS[index % DAILY_TIPS.length] };
}
