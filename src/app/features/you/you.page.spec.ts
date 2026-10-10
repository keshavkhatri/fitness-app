import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { FitnessProfileRepository } from '../../core/profile/fitness-profile.repository';
import { UnitPreferenceService } from '../../core/profile/unit-preference.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { NORMAL_PROFILE } from '../assessment/testing/assessment-fixtures';
import { YouPage } from './you.page';

const clean = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim();

describe('YouPage', () => {
  it('Your profile opens the profile review, returning to You when backed out of', () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
    const fixture = TestBed.createComponent(YouPage);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=profile-entry]')!;
    expect(clean(button)).toBe('Your profile Review and edit your details and goals');
    button.click();
    expect(forward).toHaveBeenCalledExactlyOnceWith('/onboarding/review', { queryParams: { returnTo: '/you' } });
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
