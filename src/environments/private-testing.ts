/**
 * Private-testing promo code: the one place it is defined.
 *
 * Imported only by the environments that turn private testing on (`environment.ts` and `environment.prod.ts`). Remove
 * the import and the `privateTesting` block from `environment.prod.ts` and a build contains neither the code nor the
 * switch. It is a shared fixed code for a small group of trusted testers, not a payment check: anyone can read it out
 * of a build that enables it.
 */
export const PRIVATE_TESTING_PROMO_CODE = 'STOKEFORMLAB';
