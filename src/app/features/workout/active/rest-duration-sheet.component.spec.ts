import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { RestChoice, RestDurationSheetComponent } from './rest-duration-sheet.component';

interface Internals {
  draft(): number;
  all: { set(value: boolean): void };
  nudge(delta: number): void;
  save(): void;
  usePlanned(): void;
  hasCustom(): boolean;
}

function render(seconds = 120, planned = 120) {
  TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
  const fixture = TestBed.createComponent(RestDurationSheetComponent);
  fixture.componentRef.setInput('exerciseName', 'Bench Press');
  fixture.componentRef.setInput('seconds', seconds);
  fixture.componentRef.setInput('plannedSeconds', planned);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  const sheet = fixture.componentInstance as unknown as Internals;
  const chosen: RestChoice[] = [];
  fixture.componentInstance.chosen.subscribe((c) => chosen.push(c));
  return { fixture, sheet, chosen };
}

describe('RestDurationSheetComponent', () => {
  it('starts from the rest in force and steps by 15 seconds', () => {
    const { sheet } = render(120);
    expect(sheet.draft()).toBe(120);
    sheet.nudge(15);
    expect(sheet.draft()).toBe(135);
    sheet.nudge(-30);
    expect(sheet.draft()).toBe(105);
  });

  it('never goes below 15 seconds or above 10 minutes', () => {
    const { sheet } = render(20);
    sheet.nudge(-15);
    sheet.nudge(-15);
    expect(sheet.draft()).toBe(15);
    sheet.nudge(10_000);
    expect(sheet.draft()).toBe(600);
  });

  it('saves the chosen length for this exercise, and closes', () => {
    const { fixture, sheet, chosen } = render(120);
    sheet.nudge(30);
    sheet.save();
    expect(chosen).toEqual([{ seconds: 150, all: false }]);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('can apply to every exercise', () => {
    const { sheet, chosen } = render(120);
    sheet.all.set(true);
    sheet.save();
    expect(chosen).toEqual([{ seconds: 120, all: true }]);
  });

  it('can go back to the planned rest', () => {
    const { sheet, chosen } = render(45, 120);
    expect(sheet.hasCustom()).toBe(true);
    sheet.usePlanned();
    expect(chosen).toEqual([{ seconds: null, all: false }]);
  });

  it('starts again from the rest in force each time it opens', () => {
    const { fixture, sheet } = render(120);
    sheet.nudge(60);
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('seconds', 90);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(sheet.draft()).toBe(90);
  });
});
