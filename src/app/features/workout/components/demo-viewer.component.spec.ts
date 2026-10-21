import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { ExerciseDemonstration } from '../../../core/exercise-media/exercise-media';
import { DemoViewerComponent } from './demo-viewer.component';

interface Internals {
  zoom(): { scale: number; x: number; y: number };
  frame(): number;
  failed: { set(value: boolean): void; (): boolean };
  attemptQuery(): string;
  step(factor: number): void;
  reset(): void;
  togglePlay(): void;
  retry(): void;
}

const PHOTOS: ExerciseDemonstration = { frames: ['a/0.jpg', 'a/1.jpg'], artwork: false, credit: 'Photos: test' };
const GUIDE: ExerciseDemonstration = { frames: ['guide.webp'], artwork: true, credit: 'Illustration: StokeForm' };

function render(demo: ExerciseDemonstration, open = true) {
  TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
  const fixture = TestBed.createComponent(DemoViewerComponent);
  fixture.componentRef.setInput('demo', demo);
  fixture.componentRef.setInput('name', 'Push-Up');
  fixture.componentRef.setInput('open', open);
  fixture.detectChanges();
  return { fixture, viewer: fixture.componentInstance as unknown as Internals };
}

describe('DemoViewerComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('plays the start and end frames in turn while open, and pauses on request', () => {
    vi.useFakeTimers();
    const { fixture, viewer } = render(PHOTOS);
    expect(viewer.frame()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(viewer.frame()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(viewer.frame()).toBe(0);
    viewer.togglePlay();
    fixture.detectChanges();
    vi.advanceTimersByTime(3000);
    expect(viewer.frame()).toBe(0);
  });

  it('shows a single guide sheet as it is: nothing to play', () => {
    vi.useFakeTimers();
    const { viewer } = render(GUIDE);
    vi.advanceTimersByTime(5000);
    expect(viewer.frame()).toBe(0);
  });

  it('plays nothing while closed', () => {
    vi.useFakeTimers();
    const { viewer } = render(PHOTOS, false);
    vi.advanceTimersByTime(3000);
    expect(viewer.frame()).toBe(0);
  });

  it('zooms in and out by steps, between fit and 5x, and resets', () => {
    const { viewer } = render(PHOTOS);
    expect(viewer.zoom().scale).toBe(1);
    viewer.step(1.5);
    expect(viewer.zoom().scale).toBe(1.5);
    viewer.step(1.5);
    expect(viewer.zoom().scale).toBe(2.25);
    for (let i = 0; i < 10; i++) {
      viewer.step(1.5);
    }
    expect(viewer.zoom().scale).toBe(5);
    viewer.reset();
    expect(viewer.zoom()).toEqual({ scale: 1, x: 0, y: 0 });
    viewer.step(1 / 1.5);
    expect(viewer.zoom().scale).toBe(1);
  });

  it('opens fitted every time', () => {
    const { fixture, viewer } = render(PHOTOS);
    viewer.step(1.5);
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(viewer.zoom().scale).toBe(1);
  });

  it('retries a failed load with fresh image addresses', () => {
    const { viewer } = render(PHOTOS);
    viewer.failed.set(true);
    viewer.retry();
    expect(viewer.failed()).toBe(false);
    expect(viewer.attemptQuery()).toBe('?retry=1');
  });
});
