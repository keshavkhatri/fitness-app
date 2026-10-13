import { FitnessAssessment, FitnessCalculationConfig, MacroTargets } from '../../domain/fitness-calculations';
import {
  UserFitnessProfile,
  formatWeight,
  hasApplicableGoalTargets,
  roundTo,
  weightInUnit,
  weightUnitLabel,
} from '../../domain/fitness-profile';
import { NoticeTone } from '../../shared/ui';
import { ASSESSMENT_COPY, CONFIDENCE_COPY, GOAL_LABELS } from './assessment-content';

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
  readonly confidence: { readonly label: string; readonly description: string };
  /** The domain flagged something the user should review before continuing. */
  readonly requiresReview: boolean;
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
}

export type MacrosViewModel =
  | { readonly kind: 'grams'; readonly rows: readonly MacroRowViewModel[]; readonly notice: NoticeViewModel | null }
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
    macros: calorieReview ? onHold() : toMacros(assessment.targets.macros, config),
    why: ASSESSMENT_COPY.why,
    confidence: CONFIDENCE_COPY[confidenceLevel],
    requiresReview: calorieReview || macrosInfeasible,
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

function toMacros(macros: MacroTargets, config: FitnessCalculationConfig): MacrosViewModel {
  if (macros.status === 'infeasible') {
    // No gram targets exist for an infeasible plan; never invent replacements.
    return { kind: 'unavailable', notice: { tone: 'warning', ...ASSESSMENT_COPY.notices.macrosInfeasible } };
  }
  const total = macros.analysis.calorieTargetKcal;
  const share = (grams: number, kcalPerGram: number) =>
    `About ${total > 0 ? Math.round(((grams * kcalPerGram) / total) * 100) : 0}% of calories`;
  const perGram = config.kcalPerGram;

  return {
    kind: 'grams',
    rows: [
      { key: 'protein', label: 'Protein', grams: `${macros.proteinGrams} g`, share: share(macros.proteinGrams, perGram.protein) },
      { key: 'fat', label: 'Fat', grams: `${macros.fatGrams} g`, share: share(macros.fatGrams, perGram.fat) },
      {
        key: 'carbohydrate',
        label: 'Carbohydrates',
        grams: `${macros.carbohydrateGrams} g`,
        share: share(macros.carbohydrateGrams, perGram.carbohydrate),
      },
    ],
    notice: macros.status === 'constrained' ? { tone: 'warning', ...ASSESSMENT_COPY.notices.macrosConstrained } : null,
  };
}
