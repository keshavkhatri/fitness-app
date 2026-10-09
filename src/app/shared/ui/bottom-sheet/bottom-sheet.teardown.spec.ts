import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { BottomSheetComponent } from './bottom-sheet.component';

@Component({
  imports: [BottomSheetComponent],
  template: `<fit-bottom-sheet title="Left open" [(open)]="open"><button type="button">Inside</button></fit-bottom-sheet>`,
})
class HostComponent {
  readonly open = signal(true);
}

const PRESENTED = 'ion-modal:not(.overlay-hidden)';

const macrotasks = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await new Promise((r) => setTimeout(r));
  }
};

/**
 * Spec files share one jsdom document (the unit-test builder runs Vitest with
 * `isolate: false`). A sheet opened just before a test ends could be presented
 * by Ionic after the fixture was removed, and stay presented in <body>, where
 * its focus trap took focus in later tests (an intermittent basics-step focus
 * failure). See src/test-setup.ts.
 */
describe('Bottom sheet opened as a test ends', () => {
  async function presentedSheet() {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    for (let i = 0; i < 50 && !document.querySelector('ion-modal.show-modal'); i++) {
      await macrotasks(1);
    }
    return { fixture, modal: document.querySelector('ion-modal.show-modal') };
  }

  const expectFocusKept = () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    input.remove();
  };

  it('a sheet open while its test runs is left alone', async () => {
    const { modal } = await presentedSheet();
    expect(modal?.textContent).toContain('Inside');
    await macrotasks(5);
    expect(modal?.isConnected).toBe(true);
  });

  it('a presented sheet is gone as soon as its fixture is removed', async () => {
    const { fixture, modal } = await presentedSheet();
    expect(modal).not.toBeNull();
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
    // Ionic dismisses it too, but only later: a test starting meanwhile lost focus.
    await Promise.resolve();
    expect(document.querySelector(PRESENTED)).toBeNull();
    expectFocusKept();
  });

  it('is never left presented in the document, so later tests keep their focus', async () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    // Torn down and removed from the document before Ionic presents the sheet,
    // as when a test ends right after opening it.
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
    await macrotasks(20);
    expect(document.querySelector(PRESENTED)).toBeNull();
    expectFocusKept();
  });
});
