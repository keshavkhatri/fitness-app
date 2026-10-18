import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { FitnessProfileRepository } from '../../core/profile/fitness-profile.repository';
import { UnitPreferenceService } from '../../core/profile/unit-preference.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { NORMAL_PROFILE } from '../assessment/testing/assessment-fixtures';
import { By } from '@angular/platform-browser';

import { UserIdentityService } from '../../core/identity/user-identity.service';
import { QuickAddLauncher } from '../../shell/quick-add/quick-add-launcher.service';
import { IdentitySheetComponent } from './identity-sheet.component';
import { YouPage } from './you.page';
import { CLOCK } from '../../core/time/clock';
import { currentAge, formatHeight } from '../../domain/fitness-profile';
import { GOAL_OPTIONS } from '../onboarding/onboarding-content';

const clean = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim();

describe('YouPage', () => {
  it('Your profile opens the profile review, returning to You when backed out of', () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=profile-entry]')!;
    expect(clean(button)).toBe('Profile Personal details');
    button.click();
    expect(forward).toHaveBeenCalledExactlyOnceWith('/onboarding/review', { queryParams: { returnTo: '/you' } });
  });

  describe('Name and photo', () => {
    async function render(storage = new MemoryKeyValueStorage()) {
      TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }] });
      const fixture = TestBed.createComponent(YouPage);
      await fixture.whenStable();
      fixture.detectChanges();
      const sheet = () => fixture.debugElement.query(By.directive(IdentitySheetComponent)).componentInstance as IdentitySheetComponent;
      return { fixture, storage, sheet, el: fixture.nativeElement as HTMLElement };
    }

    it('invites a name until one is saved, then shows it with the avatar', async () => {
      const { fixture, el, sheet } = await render();
      const entry = el.querySelector<HTMLButtonElement>('[data-testid=identity-entry]')!;
      expect(entry.getAttribute('aria-label')).toBe('Edit name and photo');
      expect(clean(el.querySelector('[data-testid=you-name]')!)).toBe('Add your name');
      entry.click();
      fixture.detectChanges();
      expect(sheet().open()).toBe(true);

      sheet().save.emit({ name: 'Alex Morgan', photo: null });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(sheet().open()).toBe(false);
      expect(clean(el.querySelector('[data-testid=you-name]')!)).toBe('Alex Morgan');
      expect(clean(el.querySelector('[data-testid=identity-entry] fit-avatar')!)).toBe('AM');
      expect(TestBed.inject(UserIdentityService).identity().name).toBe('Alex Morgan');
    });

    it('a failed save keeps the sheet open and says so', async () => {
      const storage = new MemoryKeyValueStorage();
      const { fixture, el, sheet } = await render(storage);
      el.querySelector<HTMLButtonElement>('[data-testid=identity-entry]')!.click();
      storage.failWrites = true;
      sheet().save.emit({ name: 'Alex', photo: null });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(sheet().open()).toBe(true);
      expect(sheet().saveError()).toBe("Couldn't save. Try again.");
    });
  });

  it('shows the plan (Free until the store confirms Premium) and opens the plan screen, returning to You', () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(clean(el.querySelector('[data-testid=plan-name]')!)).toBe('Free');
    el.querySelector<HTMLElement>('[data-testid=plan-entry]')!.click();
    expect(forward).toHaveBeenCalledExactlyOnceWith('/offer', { queryParams: { next: '/you' } });
  });

  it('Quick add (moved from the tab bar) opens the Quick Add sheet', () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const entry = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=quick-add-entry]')!;
    expect(entry.getAttribute('aria-haspopup')).toBe('dialog');
    entry.click();
    expect(TestBed.inject(QuickAddLauncher).open()).toBe(true);
  });

  it('shows age, height and goal from the profile; every tile opens its screen', async () => {
    const storage = new MemoryKeyValueStorage();
    TestBed.configureTestingModule({
      providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => new Date(2026, 9, 8, 12) }],
    });
    await TestBed.inject(FitnessProfileRepository).save(NORMAL_PROFILE);
    const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
    const fixture = TestBed.createComponent(YouPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).toContain('fit-theme-dashboard');
    const age = currentAge(NORMAL_PROFILE.dateOfBirth, new Date(2026, 9, 8, 12));
    expect(clean(el.querySelector('[data-testid=you-details]')!)).toBe(`${age} years · ${formatHeight(NORMAL_PROFILE.height, NORMAL_PROFILE.unitSystem)}`);
    const goal = el.querySelector<HTMLButtonElement>('[data-testid=goal-entry]')!;
    expect(clean(goal)).toContain(GOAL_OPTIONS.find((o) => o.value === NORMAL_PROFILE.primaryGoal)!.label);
    goal.click();
    expect(forward).toHaveBeenLastCalledWith('/onboarding/review', { queryParams: { returnTo: '/you' } });
    const click = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid=${id}]`)!.click();
    click('weight-history-entry');
    expect(forward).toHaveBeenLastCalledWith('/you/weight-history');
    click('measurements-entry');
    expect(forward).toHaveBeenLastCalledWith('/you/measurements');
    click('body-composition-entry');
    expect(forward).toHaveBeenLastCalledWith('/you/body-composition');
    click('review-entry');
    expect(forward).toHaveBeenLastCalledWith('/you/review');
    el.querySelector<HTMLButtonElement>('[data-testid=progress-entry] button')!.click();
    expect(forward).toHaveBeenLastCalledWith(['/you', 'progress']);
  });

  it('without a profile: no age, height or goal (nothing made up)', async () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }] });
    const fixture = TestBed.createComponent(YouPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=you-details]')).toBeNull();
    expect(el.querySelector('[data-testid=goal-entry]')).toBeNull();
  });

  describe('Units', () => {
    async function render(withProfile: boolean) {
      const storage = new MemoryKeyValueStorage();
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }],
      });
      if (withProfile) {
        await TestBed.inject(FitnessProfileRepository).save(NORMAL_PROFILE);
      }
      const fixture = TestBed.createComponent(YouPage);
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    const radio = (el: HTMLElement, value: string) =>
      el.querySelector<HTMLInputElement>(`input[name=unit-system][value=${value}]`)!;

    it("shows the profile's units and is no longer listed as coming soon", async () => {
      const { el } = await render(true);

      expect(radio(el, 'metric').checked).toBe(true);
      expect(radio(el, 'imperial').checked).toBe(false);
      const upcoming = [...el.querySelectorAll('.settings-list li')].map(clean);
      expect(upcoming.some((text) => text?.startsWith('Units'))).toBe(false);
    });

    it('is hidden without a profile (nothing to change)', async () => {
      const { el } = await render(false);

      expect(el.querySelector('input[name=unit-system]')).toBeNull();
    });

    it('saves a new choice', async () => {
      const { fixture, el } = await render(true);
      const set = vi.spyOn(TestBed.inject(UnitPreferenceService), 'set');

      radio(el, 'imperial').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(set).toHaveBeenCalledExactlyOnceWith('imperial');
      expect((await TestBed.inject(FitnessProfileRepository).load())?.unitSystem).toBe('imperial');
      expect(radio(el, 'imperial').checked).toBe(true);
      expect(el.querySelector('[data-testid=units-error]')).toBeNull();
    });

    it('puts the previous choice back and says so when saving fails', async () => {
      const { fixture, el } = await render(true);
      vi.spyOn(TestBed.inject(UnitPreferenceService), 'set').mockResolvedValue({ ok: false, kind: 'save-failed' });

      radio(el, 'imperial').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(radio(el, 'metric').checked).toBe(true);
      const error = el.querySelector('[data-testid=units-error]')!;
      expect(error.getAttribute('role')).toBe('alert');
      expect(clean(error)).toBe("Couldn't change your units. Try again.");
    });
  });
});
