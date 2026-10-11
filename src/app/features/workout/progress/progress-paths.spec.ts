import { ActivatedRoute } from '@angular/router';

import { progressBaseOf } from './progress-paths';

/** A route whose root-to-leaf segments are `paths`. */
const routeAt = (...paths: string[]) =>
  ({ snapshot: { pathFromRoot: [{ url: [] }, ...paths.map((path) => ({ url: [{ path }] }))] } }) as unknown as ActivatedRoute;

describe('progressBaseOf', () => {
  it('keeps links inside the stack the page was opened in', () => {
    expect(progressBaseOf(routeAt('progress'))).toBe('/progress');
    expect(progressBaseOf(routeAt('progress', 'exercises'))).toBe('/progress');
    expect(progressBaseOf(routeAt('you', 'progress'))).toBe('/you/progress');
    expect(progressBaseOf(routeAt())).toBe('/you/progress');
  });
});
