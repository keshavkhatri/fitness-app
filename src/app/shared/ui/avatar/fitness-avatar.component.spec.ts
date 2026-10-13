import { TestBed } from '@angular/core/testing';

import { FitnessAvatarComponent } from './fitness-avatar.component';

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(FitnessAvatarComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FitnessAvatarComponent', () => {
  it('shows the photo when there is one', () => {
    const el = render({ name: 'Alex', photo: 'data:image/jpeg;base64,AAAA' });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('falls back to initials, then to an icon', () => {
    expect(render({ name: 'Alex Morgan' }).textContent?.trim()).toBe('AM');
    expect(render({ name: 'alex' }).textContent?.trim()).toBe('A');
    expect(render({ name: null }).querySelector('ion-icon')).not.toBeNull();
  });

  it('is decorative unless labelled', () => {
    expect(render({ name: 'Alex' }).getAttribute('aria-hidden')).toBe('true');
    const labelled = render({ name: 'Alex', label: 'Alex' });
    expect(labelled.getAttribute('role')).toBe('img');
    expect(labelled.getAttribute('aria-label')).toBe('Alex');
  });
});
