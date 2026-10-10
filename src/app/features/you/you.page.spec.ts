import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

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
});
