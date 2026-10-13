import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { ThemeService } from './theme.service';

const KEY = 'fitness.theme-preference';

describe('ThemeService', () => {
  const root = document.documentElement;
  let storage: MemoryKeyValueStorage;

  function createService(): ThemeService {
    TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }] });
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    root.classList.remove('theme-light', 'theme-dark');
  });

  it('follows the system theme by default (no class on <html>)', () => {
    const service = createService();
    TestBed.tick();

    expect(service.preference()).toBe('system');
    expect(root.classList.contains('theme-light')).toBe(false);
    expect(root.classList.contains('theme-dark')).toBe(false);
  });

  it('applies an explicit preference to <html> and persists it', () => {
    const service = createService();

    service.setPreference('dark');
    TestBed.tick();
    expect(service.resolvedTheme()).toBe('dark');
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(storage.values.get(KEY)).toBe('dark');

    service.setPreference('light');
    TestBed.tick();
    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('theme-light')).toBe(true);
  });

  it('an always-dark screen makes the status bar dark without changing the preference or <html>', () => {
    const service = createService();
    service.setPreference('light');
    TestBed.tick();
    expect(service.statusBarTheme()).toBe('light');

    const releaseA = service.holdAlwaysDark();
    const releaseB = service.holdAlwaysDark();
    expect(service.statusBarTheme()).toBe('dark');
    expect(service.preference()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
    expect(root.classList.contains('theme-light')).toBe(true);

    releaseA();
    releaseA(); // releasing twice never releases the other hold
    expect(service.statusBarTheme()).toBe('dark');
    releaseB();
    expect(service.statusBarTheme()).toBe('light');
  });

  it('restores a stored preference', async () => {
    storage.values.set(KEY, 'dark');
    const service = createService();

    await service.restore();
    TestBed.tick();

    expect(service.preference()).toBe('dark');
    expect(root.classList.contains('theme-dark')).toBe(true);
  });

  it('ignores invalid stored values', async () => {
    storage.values.set(KEY, 'sepia');
    const service = createService();

    await service.restore();

    expect(service.preference()).toBe('system');
  });
});
