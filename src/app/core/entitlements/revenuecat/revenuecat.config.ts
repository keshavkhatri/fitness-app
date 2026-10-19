import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../../../environments/environment';
import { AppEnvironment } from '../../../../environments/environment.model';

export interface RevenueCatConfig {
  /** Public SDK key for Google Play, or null when billing isn't configured. */
  readonly apiKey: string | null;
  /** The RevenueCat entitlement that means "Pro". */
  readonly entitlementId: string;
}

/** A RevenueCat public key for Google Play starts with `goog_`; anything else is treated as not configured. */
export function isAndroidPublicKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && /^goog_[A-Za-z0-9]{8,}$/.test(key.trim());
}

export function revenueCatFrom(env: AppEnvironment): RevenueCatConfig {
  const key = env.revenueCat?.androidApiKey;
  return { apiKey: isAndroidPublicKey(key) ? key.trim() : null, entitlementId: env.revenueCat?.entitlementId?.trim() || 'pro' };
}

export const REVENUECAT_CONFIG = new InjectionToken<RevenueCatConfig>('REVENUECAT_CONFIG', {
  providedIn: 'root',
  factory: () => revenueCatFrom(environment),
});

/** Whether the app is running as the Android app (RevenueCat is wired for Google Play only so far). */
export const BILLING_PLATFORM_IS_ANDROID = new InjectionToken<boolean>('BILLING_PLATFORM_IS_ANDROID', {
  providedIn: 'root',
  factory: () => Capacitor.getPlatform() === 'android',
});
