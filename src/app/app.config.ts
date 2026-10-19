import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, TitleStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app.routes';
import { BrandTitleStrategy } from './core/brand-title.strategy';
import { registerAppIcons } from './core/icons/register-icons';
import { AuthService } from './core/auth/auth.service';
import { BILLING_PROVIDER } from './core/entitlements/billing';
import { billingProviderFactory } from './core/entitlements/revenuecat/revenuecat-billing.provider';
import { trackTextScale } from './core/text-scale/text-scale';
import { ThemeService } from './core/theme/theme.service';

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Ionic's `mode` is deliberately NOT set: iOS gets `ios` and Android gets `md`,
 * so platform behaviour (page transitions, iOS swipe-back, Android touch
 * feedback) stays native.
 *
 * The visual identity is mode-independent: colors, type and spacing come from
 * our tokens, and `fit-*` components never rely on Ionic mode-specific
 * features (e.g. iOS-only collapsible large titles). New components must follow
 * the same rule. Platform-specific tweaks, if ever needed, belong here
 * (Ionic config) or behind `Platform`, not inside components.
 */
const ionicConfig: Parameters<typeof provideIonicAngular>[0] = {
  animated: !prefersReducedMotion,
};

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: TitleStrategy, useExisting: BrandTitleStrategy },
    provideIonicAngular(ionicConfig),
    // Pro subscriptions go through RevenueCat once a public SDK key is configured (environments/billing.ts);
    // until then nothing can be bought and everyone is on Free.
    { provide: BILLING_PROVIDER, useFactory: billingProviderFactory },
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideAppInitializer(() => {
      registerAppIcons();
      trackTextScale();
      // Not awaited: the stored account is checked in the background, so startup never waits on the network.
      void inject(AuthService).restore();
      // Awaited so the stored theme applies before first paint.
      return inject(ThemeService).restore();
    }),
  ],
};
