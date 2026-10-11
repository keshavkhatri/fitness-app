import { TestBed } from '@angular/core/testing';

import { WorkoutArtComponent } from './workout-art.component';

function render(seed: string) {
  const fixture = TestBed.createComponent(WorkoutArtComponent);
  fixture.componentRef.setInput('seed', seed);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
const layout = (el: HTMLElement) => [...el.querySelectorAll('rect.post, g[transform]')].map((n) => n.getAttribute('x') ?? n.getAttribute('transform'));

describe('WorkoutArtComponent', () => {
  it('is decorative', () => {
    expect(render('day-1-upper').querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lays out the same scene for the same seed, a different one for another', () => {
    expect(layout(render('day-1-upper'))).toEqual(layout(render('day-1-upper')));
    expect(layout(render('day-1-upper'))).not.toEqual(layout(render('day-2-lower')));
  });

  it('uses unique gradient ids per instance (several cards can share a page)', () => {
    const a = render('x').querySelector('radialGradient')?.id;
    const b = render('x').querySelector('radialGradient')?.id;
    expect(a).not.toBe(b);
  });
});
