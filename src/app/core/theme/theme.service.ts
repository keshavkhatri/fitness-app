import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

import { KeyValueStorage } from '../storage/key-value-storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'fitness.theme-preference';
const THEME_CLASSES: Record<ResolvedTheme, string> = { light: 'theme-light', dark: 'theme-dark' };

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Owns the user's appearance preference and applies it to the document.
 *
 * Colors themselves live in CSS tokens (src/theme). This service only toggles
 * `theme-light` / `theme-dark` on <html>; with no class the OS setting wins.
 * Persistence goes through `KeyValueStorage`, so the backing store can change
 * without touching this service.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(KeyValueStorage);
  private readonly darkQuery = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  private readonly systemPrefersDark = signal(this.darkQuery?.matches ?? false);
  private readonly preferenceState = signal<ThemePreference>('system');

  /** Screens that are always dark (the active workout) currently on top. */
  private readonly alwaysDarkHolds = signal(0);

  readonly preference = this.preferenceState.asReadonly();
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const preference = this.preferenceState();
    if (preference !== 'system') {
      return preference;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  /** The theme the native status bar follows: dark while an always-dark screen is open, otherwise the resolved theme. */
  readonly statusBarTheme = computed<ResolvedTheme>(() => (this.alwaysDarkHolds() > 0 ? 'dark' : this.resolvedTheme()));

  constructor() {
    this.darkQuery?.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));

    effect(() => this.applyPreference(this.preferenceState()));
    effect(() => void this.syncNativeStatusBar(this.statusBarTheme()));
  }

  /**
   * An always-dark screen (see fit-theme-immersive) is open: the status bar
   * gets light text even in a light Appearance. Returns the release function;
   * call it when the screen goes away. Doesn't change the stored preference.
   */
  holdAlwaysDark(): () => void {
    this.alwaysDarkHolds.update((n) => n + 1);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.alwaysDarkHolds.update((n) => Math.max(0, n - 1));
      }
    };
  }

  /** Loads the stored preference. Awaited at startup to avoid a theme flash. */
  async restore(): Promise<void> {
    const stored = await this.storage.get(STORAGE_KEY);
    if (isThemePreference(stored)) {
      this.preferenceState.set(stored);
    }
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    // Non-critical: if persisting fails the preference still applies this session.
    this.storage.set(STORAGE_KEY, preference).catch(() => undefined);
  }

  private applyPreference(preference: ThemePreference): void {
    const classList = this.document.documentElement.classList;
    classList.remove(THEME_CLASSES.light, THEME_CLASSES.dark);
    if (preference !== 'system') {
      classList.add(THEME_CLASSES[preference]);
    }
  }

  private async syncNativeStatusBar(theme: ResolvedTheme): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      // Style.Dark = light text, for dark backgrounds.
      await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    } catch {
      // Status bar styling is cosmetic; never block the app on it.
    }
  }
}
