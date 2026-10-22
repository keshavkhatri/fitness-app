import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, TitleStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app.routes';
import { BrandTitleStrategy } from './core/brand-title.strategy';
import { registerAppIcons } from './core/icons/register-icons';
import { provideErrorReporting } from './core/monitoring/error-reporting';
import { pageTransition } from './core/motion/page-transition';
import { AuthService } from './core/auth/auth.service';
import { EncryptedKeyValueStorage } from './core/storage/encrypted-key-value-storage';
import { KeyValueStorage } from './core/storage/key-value-storage';
import { SyncService } from './core/sync/sync.service';
import { TrackedKeyValueStorage } from './core/sync/tracked-key-value-storage';
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
const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const ionicConfig: Parameters<typeof provideIonicAngular>[0] = {
  animated: !prefersReducedMotion,
  // Android: the app's own slide-and-fade (docs/motion-plan.md #1). iOS keeps its native transition and swipe-back.
  ...(isIos ? {} : { navAnimation: pageTransition }),
};

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: TitleStrategy, useExisting: BrandTitleStrategy },
    ...provideErrorReporting(),
    provideIonicAngular(ionicConfig),
    // Pro subscriptions go through RevenueCat once a public SDK key is configured (environments/billing.ts);
    // until then nothing can be bought and everyone is on Free.
    { provide: BILLING_PROVIDER, useFactory: billingProviderFactory },
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideAppInitializer(async () => {
      registerAppIcons();
      // Everything injected before the first await (the injection context ends there).
      // Data stored before encryption existed is encrypted once, before anything reads or writes it.
      const storage = inject(KeyValueStorage);
      const theme = inject(ThemeService);
      const auth = inject(AuthService);
      const sync = inject(SyncService);
      const base = storage instanceof TrackedKeyValueStorage ? storage.inner : storage;
      if (base instanceof EncryptedKeyValueStorage) {
        await base.encryptExisting();
      }
      trackTextScale();
      // Not awaited: the stored account is checked in the background, so startup never waits on the network.
      void auth.restore();
      // Cloud backup (if on): changes from another phone arrive before the screens read their data (at most ~3 s).
      await sync.start().catch(() => undefined);
      // Awaited so the stored theme applies before first paint.
      return theme.restore();
    }),
  ],
};
