import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CLOCK } from '../../core/time/clock';
import { QuickAddSheetComponent } from '../quick-add/quick-add-sheet.component';
import { QUICK_ADD_ACTIONS, QuickAddAction } from '../quick-add/quick-add.actions';
import { TabsPage } from './tabs.page';

const action = (id: QuickAddAction['id']) => QUICK_ADD_ACTIONS.find((a) => a.id === id)!;

async function render(now: Date, navigate: () => Promise<boolean> = () => Promise.resolve(true)) {
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: CLOCK, useValue: () => now }],
  });
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockImplementation(navigate);
  const fixture = TestBed.createComponent(TabsPage);
  fixture.detectChanges();
  const sheet = fixture.debugElement.query(By.directive(QuickAddSheetComponent)).componentInstance as QuickAddSheetComponent;
  /** What a tap on a sheet tile does. */
  const choose = async (id: QuickAddAction['id']) => {
    sheet.open.set(true);
    (sheet as unknown as { select(a: QuickAddAction): void }).select(action(id));
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
  };
  return { fixture, sheet, forward, choose };
}

describe('Quick Add (tabs shell)', () => {
  it('Add food, Log weight and Add measurement are available; other actions keep their state', () => {
    expect(QUICK_ADD_ACTIONS.map((a) => [a.id, a.available])).toEqual([
      ['start-workout', false],
      ['add-food', true],
      ['log-weight', true],
      ['add-measurement', true],
      ['upload-inbody', false],
      ['add-progress-photo', false],
    ]);
  });

  it('Add food closes the sheet and opens the existing food form for today (local date)', async () => {
    // 00:30 local on 9 Oct: still 8 Oct in UTC for zones east of UTC; the form must get the local date.
    const { sheet, forward, choose } = await render(new Date(2026, 9, 9, 0, 30));
    await choose('add-food');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { date: '2026-10-09' } });
  });

  it('if navigation doesn’t happen, the sheet reopens', async () => {
    const { sheet, choose } = await render(new Date(2026, 9, 8, 12), () => Promise.resolve(false));
    await choose('add-food');
    expect(sheet.open()).toBe(true);

    TestBed.resetTestingModule();
    const failing = await render(new Date(2026, 9, 8, 12), () => Promise.reject(new Error('nav')));
    await failing.choose('add-food');
    expect(failing.sheet.open()).toBe(true);
  });

  it('Log weight closes the sheet and opens the existing new weight entry form', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('log-weight');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
  });

  it('if Log weight navigation doesn’t happen, the sheet reopens', async () => {
    const { sheet, choose } = await render(new Date(2026, 9, 8, 12), () => Promise.resolve(false));
    await choose('log-weight');
    expect(sheet.open()).toBe(true);

    TestBed.resetTestingModule();
    const failing = await render(new Date(2026, 9, 8, 12), () => Promise.reject(new Error('nav')));
    await failing.choose('log-weight');
    expect(failing.sheet.open()).toBe(true);
  });

  it('Add measurement closes the sheet and opens the existing new measurement form', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('add-measurement');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(['/you', 'measurements', 'new']);
  });

  it('if Add measurement navigation doesn’t happen, the sheet reopens', async () => {
    const { sheet, choose } = await render(new Date(2026, 9, 8, 12), () => Promise.resolve(false));
    await choose('add-measurement');
    expect(sheet.open()).toBe(true);

    TestBed.resetTestingModule();
    const failing = await render(new Date(2026, 9, 8, 12), () => Promise.reject(new Error('nav')));
    await failing.choose('add-measurement');
    expect(failing.sheet.open()).toBe(true);
  });

  it('unavailable actions do nothing', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('upload-inbody');
    expect(forward).not.toHaveBeenCalled();
    expect(sheet.open()).toBe(true);
  });
});
