import { Provider, inject } from '@angular/core';
import { NavController } from '@ionic/angular';

/** The You sections that are also mounted under another tab (they keep their `/you/…` links in code). */
const SHARED_SECTIONS = ['/you/weight-history', '/you/measurements', '/you/body-composition'] as const;

type Url = string | readonly unknown[] | unknown;

/** A `/you/…` link of a shared section, in the stack at `base`; anything else unchanged. */
export function inStack<T extends Url>(url: T, base: string): T {
  if (typeof url === 'string') {
    if (url === '/you') {
      return base as T;
    }
    const section = SHARED_SECTIONS.find((s) => url === s || url.startsWith(`${s}/`));
    return (section ? `${base}${url.slice('/you'.length)}` : url) as T;
  }
  if (Array.isArray(url) && url[0] === '/you') {
    const joined = `/you/${String(url[1] ?? '')}`;
    return (SHARED_SECTIONS.some((s) => s === joined) ? [base, ...url.slice(1)] : url.length === 1 ? [base] : url) as T;
  }
  return url as T;
}

/**
 * For a route that mounts the shared You sections (weight history, measurements, body composition) inside another
 * tab: the pages there keep navigating to their \`/you/…\` paths in code, and this keeps them in the tab they were
 * opened from, so Back returns to where the user came from instead of jumping to You. Everything else is the app's
 * one NavController (its direction and animation state are shared with the router outlets).
 */
export function provideStackNav(base: string): Provider {
  return {
    provide: NavController,
    useFactory: () => {
      const root = inject(NavController, { skipSelf: true });
      const rewrite = new Set<PropertyKey>(['navigateForward', 'navigateBack', 'navigateRoot']);
      return new Proxy(root, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== 'function') {
            return value;
          }
          return rewrite.has(property)
            ? (url: Url, ...rest: unknown[]) => (value as (...args: unknown[]) => unknown).call(target, inStack(url, base), ...rest)
            : value.bind(target);
        },
      });
    },
  };
}
