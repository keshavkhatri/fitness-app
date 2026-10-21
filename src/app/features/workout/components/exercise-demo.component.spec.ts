import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular';

import { EXERCISE_ARTWORK_LOOKUP, EXERCISE_MEDIA_BASE_URL } from '../../../core/exercise-media/exercise-media';
import { DemoViewerComponent } from './demo-viewer.component';
import { ExerciseDemoComponent } from './exercise-demo.component';

// Artwork coverage grows over time: pin it here so these tests stay about the component (only back-squat has a guide).
const ARTWORK = { provide: EXERCISE_ARTWORK_LOOKUP, useValue: (id: string) => (id === 'back-squat' ? 'back-squat-guide.webp' : null) };
const BASE = 'https://media.example.test/exercises/';

function render(exerciseId: string, options: { base?: string | null; variant?: 'inline' | 'stage' } = {}) {
  const base = options.base === undefined ? BASE : options.base;
  TestBed.configureTestingModule({ providers: [provideIonicAngular(), { provide: EXERCISE_MEDIA_BASE_URL, useValue: base }, ARTWORK] });
  const fixture = TestBed.createComponent(ExerciseDemoComponent);
  fixture.componentRef.setInput('exerciseId', exerciseId);
  fixture.componentRef.setInput('name', 'Push-Up');
  if (options.variant) {
    fixture.componentRef.setInput('variant', options.variant);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const viewer = () => fixture.debugElement.query(By.directive(DemoViewerComponent))?.componentInstance as DemoViewerComponent | undefined;
  return { fixture, el, q, viewer };
}

describe('ExerciseDemoComponent', () => {
  it('inline: loads nothing until asked, then opens the demonstration in a popup', () => {
    const { fixture, el, q, viewer } = render('push-up');
    expect(el.querySelector('img')).toBeNull();
    expect(q('demo-toggle')?.textContent?.trim()).toBe('Show demonstration');
    expect(q('demo-toggle')?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(viewer()?.open()).toBe(false);

    q('demo-toggle')!.click();
    fixture.detectChanges();
    expect(viewer()?.open()).toBe(true);
    // The photos live in the popup, not in the page.
    expect(el.querySelector('img')).toBeNull();
  });

  it('stage: the area is always there, with a "How to do it" button that opens the popup', () => {
    const { fixture, el, q, viewer } = render('push-up', { variant: 'stage' });
    expect(q('demo-stage')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(q('demo-toggle')?.textContent?.trim()).toBe('How to do it');
    expect(viewer()?.open()).toBe(false);

    q('demo-toggle')!.click();
    fixture.detectChanges();
    expect(viewer()?.open()).toBe(true);
  });

  it('hands the popup the start and end photos, with their credit', () => {
    const { viewer } = render('push-up');
    const demo = viewer()!.demo();
    expect(demo.frames).toEqual([`${BASE}Pushups/0.jpg`, `${BASE}Pushups/1.jpg`]);
    expect(demo.artwork).toBe(false);
    expect(demo.credit).toContain('public domain');
  });

  it('prefers the bundled guide sheet, even with media off', () => {
    const { viewer } = render('back-squat', { base: null });
    const demo = viewer()!.demo();
    expect(demo.frames).toEqual(['assets/exercise-art/back-squat-guide.webp']);
    expect(demo.artwork).toBe(true);
    expect(demo.credit).toBe('Illustration: StokeForm');
  });

  it('renders nothing without a demonstration, or when media is off (the stage keeps its area, without a button)', () => {
    expect(render('burpees').el.textContent?.trim()).toBe('');
    for (const [id, base] of [['burpees', BASE], ['push-up', null]] as const) {
      TestBed.resetTestingModule();
      const { q, viewer, el } = render(id, { base, variant: 'stage' });
      expect(q('demo-stage')).not.toBeNull();
      expect(q('demo-toggle')).toBeNull();
      expect(viewer()).toBeUndefined();
      expect(el.querySelector('img')).toBeNull();
    }
    TestBed.resetTestingModule();
    expect(render('push-up', { base: null }).el.textContent?.trim()).toBe('');
  });

  it('closes the popup when the exercise changes', () => {
    const { fixture, q, viewer } = render('push-up', { variant: 'stage' });
    q('demo-toggle')!.click();
    fixture.detectChanges();
    expect(viewer()?.open()).toBe(true);
    fixture.componentRef.setInput('exerciseId', 'back-squat');
    fixture.detectChanges();
    expect(viewer()?.open()).toBe(false);
  });
});
