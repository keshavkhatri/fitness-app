import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { NextExerciseCardComponent } from './next-exercise-card.component';
import { RestTimerComponent } from './rest-timer.component';
import { RestTimerStatus } from './rest-timer';

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('RestTimerComponent', () => {
  function render(status: RestTimerStatus, remaining: number, total: number, planned = 90) {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(RestTimerComponent);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('remaining', remaining);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('plannedSeconds', planned);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const emitted: string[] = [];
    const c = fixture.componentInstance;
    c.startRest.subscribe(() => emitted.push('start'));
    c.pauseRest.subscribe(() => emitted.push('pause'));
    c.resumeRest.subscribe(() => emitted.push('resume'));
    c.dismissRest.subscribe(() => emitted.push('dismiss'));
    const button = (label: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement | undefined;
    const ring = () => el.querySelector('fit-progress')!;
    return { el, emitted, button, ring };
  }

  it('idle: shows the programmed rest with a start button and an empty ring', () => {
    const { el, emitted, button, ring } = render('idle', 0, 0, 90);
    expect(el.querySelector('[data-testid="rest-idle"]')).not.toBeNull();
    expect(clean(el.querySelector('[data-testid="rest-time"]'))).toContain('01:30');
    expect(ring().getAttribute('aria-valuetext')).toBe('Rest, 01:30 planned');
    expect(ring().getAttribute('aria-valuenow')).toBe('0');
    expect(button('Pause')).toBeUndefined();
    expect(button('Dismiss')).toBeUndefined();
    button('Start rest')!.click();
    expect(emitted).toEqual(['start']);
  });

  // Restart and skip live in the options menu, off the tile.
  it('running: the ring drains with the time left; the one control is pause', () => {
    const { el, emitted, button, ring } = render('running', 45, 90);
    expect(clean(el.querySelector('[data-testid="rest-time"]'))).toContain('00:45');
    expect(ring().getAttribute('aria-valuenow')).toBe('45');
    expect(ring().getAttribute('aria-valuemax')).toBe('90');
    expect(ring().getAttribute('aria-valuetext')).toBe('00:45 remaining');
    expect(button('Restart')).toBeUndefined();
    expect(button('Skip Rest')).toBeUndefined();
    button('Pause')!.click();
    expect(emitted).toEqual(['pause']);
  });

  it('paused: offers resume', () => {
    const { emitted, button } = render('paused', 30, 90);
    expect(button('Pause')).toBeUndefined();
    button('Resume')!.click();
    expect(emitted).toEqual(['resume']);
  });

  it('done: says so in text, shows a full ring and a way to dismiss', () => {
    const { el, emitted, button, ring } = render('done', 0, 90);
    expect(clean(el.querySelector('#rest-title'))).toBe('Rest complete');
    expect(ring().getAttribute('aria-valuenow')).toBe('90');
    expect(el.querySelector('.actions')).toBeNull();
    button('Dismiss')!.click();
    expect(emitted).toEqual(['dismiss']);
  });

  it('every button is a named, typed button with a touch-sized control', () => {
    for (const status of ['idle', 'running', 'paused', 'done'] as const) {
      TestBed.resetTestingModule();
      const { el } = render(status, 30, 90);
      for (const b of el.querySelectorAll('button')) {
        expect(b.getAttribute('type')).toBe('button');
        expect(b.getAttribute('aria-label') || clean(b)).toBeTruthy();
      }
    }
  });
});

describe('NextExerciseCardComponent', () => {
  function render(next: { exerciseId: string; name: string; muscles: string[]; planned: string; handled: number } | null) {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(NextExerciseCardComponent);
    fixture.componentRef.setInput('next', next);
    fixture.detectChanges();
    let opened = 0;
    fixture.componentInstance.open.subscribe(() => opened++);
    const card = fixture.nativeElement.querySelector('[data-testid="next-up"]') as HTMLButtonElement;
    return { card, opened: () => opened };
  }

  it('names the next exercise with its first muscle; the whole card is one button', () => {
    const { card, opened } = render({ exerciseId: 'barbell-row', name: 'Barbell Row', muscles: ['Back', 'Biceps'], planned: '3 sets · 8–12 reps', handled: 0 });
    expect(card.getAttribute('aria-label')).toBe('Next exercise: Barbell Row');
    expect(clean(card)).toBe('Next up Barbell Row Back');
    card.click();
    expect(opened()).toBe(1);
  });

  it('on the last exercise it is about finishing', () => {
    const { card, opened } = render(null);
    expect(card.getAttribute('aria-label')).toBe('Last exercise. Finish Workout');
    expect(clean(card)).toContain('Last exercise');
    expect(clean(card)).toContain('Finish when every set is done');
    card.click();
    expect(opened()).toBe(1);
  });
});
