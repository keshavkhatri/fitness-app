import { registerAppIcons } from './app/core/icons/register-icons';
import { environment } from './environments/environment';

// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Specs cover the paid tiers: Pro is sold (the live app launches free, environments/billing.ts). A spec that
// checks the free launch turns it off itself and back on afterwards.
(environment as { paidPlans: boolean }).paidPlans = true;

// Mirror the app initializer so <ion-icon> resolves names instead of trying
// to fetch SVGs (which jsdom cannot do) and flooding output with warnings.
registerAppIcons();

// Spec files share one document (the unit-test builder runs Vitest with
// `isolate: false`). Ionic moves a sheet to <body> when presenting it. When
// the element the sheet was declared in is removed (test teardown), Ionic
// dismisses the sheet only asynchronously, or not at all if the sheet is
// presented after that removal; meanwhile its focus trap takes focus in the
// tests that run next. So remove such leftovers as soon as either happens.
// (`cachedOriginalParent` is where Ionic records that element.)
// This setup file can run once per spec file; observe only once.
const leftoverModalsKey = '__removeLeftoverModals';
if (!(leftoverModalsKey in globalThis)) {
  const observer = new MutationObserver(() => {
    for (const modal of document.body.querySelectorAll(':scope > ion-modal')) {
      const declaredIn = (modal as { cachedOriginalParent?: Node }).cachedOriginalParent;
      if (declaredIn?.isConnected === false) {
        modal.remove();
      }
    }
  });
  observer.observe(document.body, { childList: true });
  Object.assign(globalThis, { [leftoverModalsKey]: observer });
}
