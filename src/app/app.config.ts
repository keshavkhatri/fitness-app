import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app.routes';
import { registerAppIcons } from './core/icons/register-icons';
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
    provideIonicAngular(ionicConfig),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideAppInitializer(() => {
      registerAppIcons();
      // Awaited so the stored theme applies before first paint.
      return inject(ThemeService).restore();
    }),
  ],
};
