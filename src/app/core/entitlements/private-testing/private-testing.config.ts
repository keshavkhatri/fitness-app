import { InjectionToken } from '@angular/core';

import { environment } from '../../../../environments/environment';
import { AppEnvironment } from '../../../../environments/environment.model';

/**
 * Private-testing access: a shared promo code that lets trusted testers use Pro without paying. It is chosen
 * at build time from the environment file (`environment.ts` in development, `environment.prod.ts` in the live
 * build) and is OFF unless an environment explicitly turns it on. While testing is private the live build has
 * it on; set `enabled: false` in `environment.prod.ts` (or remove the block) before a public launch and the promo
 * entry and code are gone. See docs/billing-revenuecat.md.
 */
export interface PrivateTestingConfig {
  readonly enabled: boolean;
  /** The code testers type in; null when private testing is off. */
  readonly promoCode: string | null;
}

export const PRIVATE_TESTING_OFF: PrivateTestingConfig = { enabled: false, promoCode: null };

/** Reads an environment's `privateTesting` block. Missing, disabled or malformed all mean OFF. */
export function privateTestingFrom(env: AppEnvironment): PrivateTestingConfig {
  const block = env.privateTesting;
  const code = typeof block?.promoCode === 'string' ? block.promoCode.trim() : '';
  return block?.enabled === true && code.length > 0 ? { enabled: true, promoCode: code } : PRIVATE_TESTING_OFF;
}

export const PRIVATE_TESTING_CONFIG = new InjectionToken<PrivateTestingConfig>('PRIVATE_TESTING_CONFIG', {
  providedIn: 'root',
  factory: () => privateTestingFrom(environment),
});
