import { FitnessAssessment, FitnessCalculationConfig, MacroTargets } from '../../domain/fitness-calculations';
import {
  UserFitnessProfile,
  formatHeight,
  formatWeight,
  hasApplicableGoalTargets,
  roundTo,
  weightInUnit,
  weightUnitLabel,
} from '../../domain/fitness-profile';
import { NoticeTone } from '../../shared/ui';
import { ACTIVITY_OPTIONS, labelFor } from '../onboarding/onboarding-content';
import { ASSESSMENT_COPY, CONFIDENCE_COPY, GOAL_FOCUS_COPY, GOAL_LABELS, WHY_COPY } from './assessment-content';

/**
 * Presentation model for the assessment screen. Built by a pure adapter from
 * the profile + domain assessment, so the template only renders: no
 * calculations, no domain status names, no raw safeguard identifiers.
 */
export interface AssessmentViewModel {
  readonly goal: GoalViewModel;
  readonly energy: EnergyViewModel;
  readonly macros: MacrosViewModel;
  readonly why: readonly string[];
  readonly confidence: ConfidenceViewModel;
  /** The domain flagged something the user should review before continuing. */
  readonly requiresReview: boolean;
  /** Weight, height and activity as the profile holds them (results view). */
  readonly profile: ProfileFactsViewModel;
  /** Each step of the calculation, from the engine's own explanation (Why these numbers?). */
  readonly calculation: CalculationViewModel;
}

export interface ConfidenceViewModel {
  readonly level: 'low' | 'moderate';
  readonly label: string;
  readonly description: string;
}

export interface ProfileFactsViewModel {
  readonly weight: string;
  readonly height: string;
  readonly activity: string;
  readonly activityDetail: string;
}

export interface CalculationStepViewModel {
  readonly key: 'bmr' | 'activity' | 'maintenance' | 'check-in' | 'goal' | 'target';
  readonly icon: string;
  readonly label: string;
  /** The value as shown, e.g. "1,750 kcal", "1.55×", "−407 kcal". */
  readonly value: string;
  readonly caption: string;
  /** Spoken form when the visible value uses symbols (×, −). */
  readonly spokenValue?: string;
}

export interface CalculationViewModel {
  readonly steps: readonly CalculationStepViewModel[];
  /** Why the final target differs from the plain goal adjustment, when it does. */
  readonly notice: NoticeViewModel | null;
  /** The inputs the estimate used ("Factors we consider"). */
  readonly factors: readonly { readonly label: string; readonly value: string }[];
}

export interface NoticeViewModel {
  readonly tone: NoticeTone;
  readonly title: string;
  readonly message: string;
}

export interface GoalViewModel {
  readonly label: string;
  /** Only present when the user set a target that applies to their goal. */
  readonly target: { readonly summary: string; readonly detail: string } | null;
}

export interface EnergyViewModel {
  /** Withheld (replaced by a notice) when the domain says the target needs review. */
  readonly calorieTarget:
    | { readonly kind: 'target'; readonly kcal: string; readonly notice: NoticeViewModel | null }
    | { readonly kind: 'review'; readonly notice: NoticeViewModel };
  readonly bmr: string;
  /** The maintenance the calorie target is built on (formula, or an accepted Calorie Check-in). */
  readonly maintenance: string;
  readonly maintenanceCaption: string;
}

export interface MacroRowViewModel {
  readonly key: 'protein' | 'fat' | 'carbohydrate';
  readonly label: string;
  readonly grams: string;
  /** Approximate share of the calorie target, e.g. "About 25% of calories". */
  readonly share: string;
  /** The same share, short: "25%". */
  readonly percent: string;
  /** Calories this macro supplies: grams × energy per gram, e.g. "576 kcal". */
  readonly kcal: string;
  /** Fraction of the macros' combined calories (0–1), for the chart: the slices always close the ring. */
  readonly fraction: number;
}

export type MacrosViewModel =
  | {
      readonly kind: 'grams';
      readonly rows: readonly MacroRowViewModel[];
      readonly notice: NoticeViewModel | null;
      /** The calorie target the macros divide, e.g. "2,306". */
      readonly totalKcal: string;
      /** How the split serves the goal. */
      readonly focus: string;
    }
  | { readonly kind: 'unavailable'; readonly notice: NoticeViewModel };

const numberFormat = new Intl.NumberFormat('en-US');
const kcal = (value: number) => `${numberFormat.format(value)} kcal`;

export function toAssessmentViewModel(
  profile: UserFitnessProfile,
  assessment: FitnessAssessment,
  config: FitnessCalculationConfig,
): AssessmentViewModel {
  const calorieReview = assessment.targets.calories.status === 'review-required';
  const macrosInfeasible = assessment.targets.macros.status === 'infeasible';
  const confidenceLevel = assessment.estimates.confidence.level === 'low' ? 'low' : 'moderate';

  return {
    goal: toGoal(profile),
    energy: toEnergy(assessment),
    macros: calorieReview ? onHold() : toMacros(assessment.targets.macros, config, profile),
    why: ASSESSMENT_COPY.why,
    confidence: { level: confidenceLevel, ...CONFIDENCE_COPY[confidenceLevel] },
    requiresReview: calorieReview || macrosInfeasible,
    profile: toProfileFacts(profile),
    calculation: toCalculation(profile, assessment),
  };
}

function toProfileFacts(profile: UserFitnessProfile): ProfileFactsViewModel {
  const activity = ACTIVITY_OPTIONS.find((o) => o.value === profile.activityLevel);
  return {
    weight: formatWeight(profile.weight, profile.unitSystem),
    height: formatHeight(profile.height, profile.unitSystem),
    activity: labelFor(ACTIVITY_OPTIONS, profile.activityLevel),
    activityDetail: activity?.description ?? '',
  };
}

const signed = (value: number) => (value > 0 ? `+${numberFormat.format(value)}` : value < 0 ? `−${numberFormat.format(-value)}` : '0');
const percentOf = (fraction: number) => `${roundTo(Math.abs(fraction) * 100, 1)}%`;

/**
 * The engine's own steps and values (its `explanation` and estimates): BMR,
 * the activity factor it used, maintenance, the goal adjustment and the final
 * target. Nothing is recalculated here except the difference between two
 * values the engine reports (the adjustment in kcal).
 */
function toCalculation(profile: UserFitnessProfile, assessment: FitnessAssessment): CalculationViewModel {
  const { explanation, estimates, targets } = assessment;
  const calories = targets.calories;
  const maintenance = explanation.maintenance;
  const fromCheckIn = maintenance.source === 'check-in';
  const fraction = explanation.goalAdjustment.fraction;
  const goal = GOAL_LABELS[explanation.goalAdjustment.goal].toLowerCase();
  const multiplier = explanation.activity.multiplier;
  const adjustmentKcal = calories.calculatedKcal - maintenance.kcal;

  const steps: CalculationStepViewModel[] = [
    { key: 'bmr', icon: 'flame-outline', label: WHY_COPY.bmr.label, value: kcal(estimates.bmrKcal), caption: WHY_COPY.bmr.caption },
    {
      key: 'activity',
      icon: 'walk-outline',
      label: WHY_COPY.activity.label,
      value: `${multiplier}×`,
      spokenValue: `times ${multiplier}`,
      caption: WHY_COPY.activity.caption(labelFor(ACTIVITY_OPTIONS, explanation.activity.level).toLowerCase()),
    },
    {
      key: 'maintenance',
      icon: 'calculator-outline',
      label: fromCheckIn ? WHY_COPY.maintenance.formulaLabel : WHY_COPY.maintenance.label,
      value: kcal(estimates.tdeeKcal),
      caption: WHY_COPY.maintenance.caption,
    },
  ];
  if (fromCheckIn) {
    steps.push({
      key: 'check-in',
      icon: 'checkmark-done-outline',
      label: WHY_COPY.checkIn.label,
      value: kcal(maintenance.kcal),
      caption: ASSESSMENT_COPY.energy.maintenanceFromCheckIn(acceptedDate.format(new Date(maintenance.acceptedAt))),
    });
  }
  steps.push({
    key: 'goal',
    icon: 'locate-outline',
    label: WHY_COPY.goal.label,
    value: fraction === 0 ? '0 kcal' : `${signed(adjustmentKcal)} kcal`,
    spokenValue: fraction === 0 ? undefined : `${adjustmentKcal < 0 ? 'minus' : 'plus'} ${numberFormat.format(Math.abs(adjustmentKcal))} kilocalories`,
    caption:
      fraction < 0
        ? WHY_COPY.goal.deficit(percentOf(fraction), goal)
        : fraction > 0
          ? WHY_COPY.goal.surplus(percentOf(fraction), goal)
          : WHY_COPY.goal.none(goal),
  });
  if (calories.status !== 'review-required') {
    steps.push({
      key: 'target',
      icon: 'flame',
      label: WHY_COPY.target.label,
      value: kcal(calories.finalKcal),
      caption: calories.status === 'floor-applied' ? WHY_COPY.target.floorCaption : WHY_COPY.target.caption,
    });
  }

  const notices = ASSESSMENT_COPY.notices;
  return {
    steps,
    notice:
      calories.status === 'review-required'
        ? { tone: 'warning', ...notices.calorieReview }
        : calories.status === 'floor-applied'
          ? { tone: 'info', ...notices.calorieAdjusted }
          : null,
    factors: [
      { label: 'Age', value: `${assessment.ageYears} years` },
      { label: 'Sex used for the estimate', value: WHY_COPY.sexBasis[explanation.bmr.sexBasis] },
      { label: 'Height', value: formatHeight(profile.height, profile.unitSystem) },
      { label: 'Weight', value: formatWeight(profile.weight, profile.unitSystem) },
      { label: 'Activity level', value: labelFor(ACTIVITY_OPTIONS, explanation.activity.level) },
      { label: 'Goal', value: GOAL_LABELS[explanation.goalAdjustment.goal] },
    ],
  };
}

/** The goal and any applicable saved target, from the profile alone (also used by Home). */
export function toGoal(profile: UserFitnessProfile): GoalViewModel {
  const target = hasApplicableGoalTargets(profile.primaryGoal) ? profile.goalTarget.targetWeight : null;
  if (!target) {
    return { label: GOAL_LABELS[profile.primaryGoal], target: null };
  }
  const unit = profile.unitSystem;
  const change = roundTo(Math.abs(weightInUnit(profile.weight, unit) - weightInUnit(target, unit)), 1);
  const verb = target.kilograms < profile.weight.kilograms ? 'Lose' : 'Gain';
  return {
    label: GOAL_LABELS[profile.primaryGoal],
    target: {
      summary: `${verb} ${change} ${weightUnitLabel(unit)}`,
      detail: `Target weight ${formatWeight(target, unit)}`,
    },
  };
}

function toEnergy(assessment: FitnessAssessment): EnergyViewModel {
  const calories = assessment.targets.calories;
  const notices = ASSESSMENT_COPY.notices;
  return {
    calorieTarget:
      calories.status === 'review-required'
        ? { kind: 'review', notice: { tone: 'warning', ...notices.calorieReview } }
        : {
            kind: 'target',
            kcal: numberFormat.format(calories.finalKcal),
            notice: calories.status === 'floor-applied' ? { tone: 'info', ...notices.calorieAdjusted } : null,
          },
    bmr: kcal(assessment.estimates.bmrKcal),
    maintenance: kcal(assessment.explanation.maintenance.kcal),
    maintenanceCaption: maintenanceCaption(assessment),
  };
}

const acceptedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function maintenanceCaption(assessment: FitnessAssessment): string {
  const basis = assessment.explanation.maintenance;
  return basis.source === 'check-in'
    ? ASSESSMENT_COPY.energy.maintenanceFromCheckIn(acceptedDate.format(new Date(basis.acceptedAt)))
    : ASSESSMENT_COPY.energy.maintenanceCaption;
}

function onHold(): MacrosViewModel {
  return { kind: 'unavailable', notice: { tone: 'info', ...ASSESSMENT_COPY.notices.macrosOnHold } };
}

function toMacros(macros: MacroTargets, config: FitnessCalculationConfig, profile: UserFitnessProfile): MacrosViewModel {
  if (macros.status === 'infeasible') {
    // No gram targets exist for an infeasible plan; never invent replacements.
    return { kind: 'unavailable', notice: { tone: 'warning', ...ASSESSMENT_COPY.notices.macrosInfeasible } };
  }
  const total = macros.analysis.calorieTargetKcal;
  const perGram = config.kcalPerGram;
  const parts = [
    { key: 'protein', label: 'Protein', grams: macros.proteinGrams, kcal: macros.proteinGrams * perGram.protein },
    { key: 'carbohydrate', label: 'Carbohydrates', grams: macros.carbohydrateGrams, kcal: macros.carbohydrateGrams * perGram.carbohydrate },
    { key: 'fat', label: 'Fat', grams: macros.fatGrams, kcal: macros.fatGrams * perGram.fat },
  ] as const;
  const macroKcal = parts.reduce((sum, part) => sum + part.kcal, 0);

  return {
    kind: 'grams',
    totalKcal: numberFormat.format(total),
    focus: GOAL_FOCUS_COPY[profile.primaryGoal],
    rows: parts.map((part) => {
      const percent = total > 0 ? Math.round((part.kcal / total) * 100) : 0;
      return {
        key: part.key,
        label: part.label,
        grams: `${part.grams} g`,
        share: `About ${percent}% of calories`,
        percent: `${percent}%`,
        kcal: kcal(Math.round(part.kcal)),
        fraction: macroKcal > 0 ? part.kcal / macroKcal : 0,
      };
    }),
    notice: macros.status === 'constrained' ? { tone: 'warning', ...ASSESSMENT_COPY.notices.macrosConstrained } : null,
  };
}
