import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { QuickAddSheetComponent } from './quick-add-sheet.component';
import { QuickAddAction } from './quick-add.actions';

const ACTIONS: readonly QuickAddAction[] = [
  { id: 'log-weight', label: 'Log weight', icon: 'scale-outline', available: true },
  { id: 'upload-inbody', label: 'Upload InBody', icon: 'document-text-outline', available: false },
];

describe('QuickAddSheetComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(QuickAddSheetComponent);
    fixture.componentRef.setInput('actions', ACTIONS);
    fixture.componentRef.setInput('open', true);

    const selected: QuickAddAction[] = [];
    fixture.componentInstance.actionSelected.subscribe((action) => selected.push(action));
    // `select` is the tile click handler; the tiles themselves live inside the
    // Ionic overlay, which jsdom does not render.
    const select = (action: QuickAddAction) =>
      (fixture.componentInstance as unknown as { select(a: QuickAddAction): void }).select(action);

    return { fixture, selected, select };
  }

  it('emits an available action and closes', () => {
    const { fixture, selected, select } = setup();

    select(ACTIONS[0]);

    expect(selected).toEqual([ACTIONS[0]]);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('ignores unavailable actions and stays open', () => {
    const { fixture, selected, select } = setup();

    select(ACTIONS[1]);

    expect(selected).toEqual([]);
    expect(fixture.componentInstance.open()).toBe(true);
  });
});
