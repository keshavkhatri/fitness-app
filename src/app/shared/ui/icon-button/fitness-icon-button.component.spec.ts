import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FitnessIconButtonComponent, FitnessIconButtonVariant } from './fitness-icon-button.component';

@Component({
  imports: [FitnessIconButtonComponent],
  template: `<button fit-icon-button type="button" icon="close" aria-label="Close" [variant]="variant()" [disabled]="disabled()" (click)="clicks = clicks + 1"></button>`,
})
class HostComponent {
  readonly variant = signal<FitnessIconButtonVariant>('plain');
  readonly disabled = signal(false);
  clicks = 0;
}

function render() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  return { fixture, button };
}

describe('FitnessIconButtonComponent', () => {
  it('keeps the native button and its accessible name; the icon is decorative', () => {
    const { button } = render();

    expect(button.getAttribute('aria-label')).toBe('Close');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes variant and size for styling, with plain/md defaults', () => {
    const { fixture, button } = render();
    expect(button.dataset['variant']).toBe('plain');
    expect(button.dataset['size']).toBe('md');

    fixture.componentInstance.variant.set('primary');
    fixture.detectChanges();
    expect(button.dataset['variant']).toBe('primary');
  });

  it('stays natively disabled', () => {
    const { fixture, button } = render();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    button.click();

    expect(button.disabled).toBe(true);
    expect(fixture.componentInstance.clicks).toBe(0);
  });
});
