import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { EXERCISE_MEDIA_BASE_URL } from '../../../core/exercise-media/exercise-media';
import { ExerciseDemoComponent } from './exercise-demo.component';

const BASE = 'https://media.example.test/exercises/';

function render(exerciseId: string, base: string | null = BASE) {
  TestBed.configureTestingModule({ providers: [provideIonicAngular(), { provide: EXERCISE_MEDIA_BASE_URL, useValue: base }] });
  const fixture = TestBed.createComponent(ExerciseDemoComponent);
  fixture.componentRef.setInput('exerciseId', exerciseId);
  fixture.componentRef.setInput('name', 'Push-Up');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = (id: string) => {
    q(id)!.click();
    fixture.detectChanges();
  };
  return { fixture, el, q, click };
}

describe('ExerciseDemoComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('loads nothing until asked, then plays the start and end frames in turn', () => {
    vi.useFakeTimers();
    const { el, q, click, fixture } = render('push-up');
    expect(el.querySelector('img')).toBeNull();
    expect(q('demo-toggle')?.getAttribute('aria-expanded')).toBe('false');
    click('demo-toggle');
    const imgs = [...el.querySelectorAll('img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([`${BASE}Pushups/0.jpg`, `${BASE}Pushups/1.jpg`]);
    expect(imgs[0].alt).toBe('Push-Up: start and end positions, shown in turn');
    expect(imgs[0].classList).toContain('shown');
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(imgs[1].classList).toContain('shown');
    click('demo-play'); // pause
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(imgs[1].classList).toContain('shown');
    expect(el.textContent).toContain('public domain');
  });

  it('offers a retry when the photos fail to load', () => {
    const { el, q, click, fixture } = render('push-up');
    click('demo-toggle');
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(q('demo-failed')?.textContent).toContain("couldn't be loaded");
    (q('demo-failed')!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('img')?.getAttribute('src')).toBe(`${BASE}Pushups/0.jpg?retry=1`);
  });

  it('renders nothing without a demonstration, or when media is off', () => {
    expect(render('burpees').el.textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    expect(render('push-up', null).el.textContent?.trim()).toBe('');
  });
});
