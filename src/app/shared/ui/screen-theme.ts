/**
 * Opt-in screen themes of the redesign (contract: docs/design-system.md).
 * The classes are defined in src/theme/_tokens.scss and re-emit the standard
 * tokens for an element's subtree:
 * - `dashboard`: warm light surfaces (charcoal when the app is dark).
 * - `immersive`: charcoal, whatever the app theme (active workout).
 *
 * A routed page opts in on its host: `host: { class: 'fit-theme-immersive' }`.
 */
export type FitScreenTheme = 'dashboard' | 'immersive';

export const SCREEN_THEME_CLASS: Readonly<Record<FitScreenTheme, string>> = {
  dashboard: 'fit-theme-dashboard',
  immersive: 'fit-theme-immersive',
};
