import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { FitScreenTheme } from '../screen-theme';
import { BottomSheetComponent } from './bottom-sheet.component';

@Component({
  imports: [BottomSheetComponent],
  template: `<fit-bottom-sheet title="Themed" [screenTheme]="theme()" [(open)]="open">
    <button type="button">Inside</button>
  </fit-bottom-sheet>`,
})
class HostComponent {
  readonly open = signal(false);
  readonly theme = signal<FitScreenTheme | undefined>(undefined);
}

function render() {
  TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const modal = (fixture.nativeElement as HTMLElement).querySelector('ion-modal')!;
  return { fixture, modal };
}

// The sheet is moved to <body> when presented, outside the page's theme, so it
// carries the screen theme class itself.
describe('BottomSheetComponent screen theme', () => {
  it('has no screen theme class by default', () => {
    const { modal } = render();

    expect(modal.classList.contains('bottom-sheet')).toBe(true);
    expect(modal.className).not.toContain('fit-theme-');
  });

  it('applies the given screen theme class alongside its own classes', () => {
    const { fixture, modal } = render();

    fixture.componentInstance.theme.set('immersive');
    fixture.detectChanges();
    expect(modal.classList.contains('fit-theme-immersive')).toBe(true);
    expect(modal.classList.contains('bottom-sheet')).toBe(true);

    fixture.componentInstance.theme.set('dashboard');
    fixture.detectChanges();
    expect(modal.classList.contains('fit-theme-dashboard')).toBe(true);
    expect(modal.classList.contains('fit-theme-immersive')).toBe(false);
    expect(modal.classList.contains('bottom-sheet')).toBe(true);
  });

  it('keeps Ionic’s own host classes', async () => {
    const { fixture, modal } = render();
    fixture.componentInstance.theme.set('immersive');
    fixture.detectChanges();
    const ionicClasses = () => [...modal.classList].filter((c) => !['bottom-sheet', 'fit-theme-immersive'].includes(c));
    await new Promise((r) => setTimeout(r));
    const before = ionicClasses();

    fixture.componentInstance.theme.set('dashboard');
    fixture.detectChanges();

    expect(before.length).toBeGreaterThan(0);
    expect(ionicClasses().filter((c) => c !== 'fit-theme-dashboard')).toEqual(before);
  });
});
