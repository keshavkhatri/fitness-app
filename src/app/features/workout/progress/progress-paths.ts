import { ActivatedRoute } from '@angular/router';

/**
 * Progress is mounted twice: as its own tab (`/progress`) and under You
 * (`/you/progress`). Links stay within whichever stack the page is in.
 */
export function progressBaseOf(route: ActivatedRoute): '/progress' | '/you/progress' {
  const first = route.snapshot.pathFromRoot.flatMap((r) => r.url.map((s) => s.path))[0];
  return first === 'progress' ? '/progress' : '/you/progress';
}
