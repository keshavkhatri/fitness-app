import { Provider, inject } from '@angular/core';
import { NavController } from '@ionic/angular';

/**
 * Pages of one tab that are also mounted inside another tab's stack: links to `<root><tail>` (a tail matching
 * `tails`) become `<base><tail>`, and `root` itself becomes `base` (the page's "back to its list" link).
 */
export interface StackMount {
  readonly root: string;
  readonly tails: RegExp;
}

/** The You sections shared with other tabs: weight history, measurements, body composition. */
export const YOU_SECTIONS: StackMount = { root: '/you', tails: /^\/(weight-history|measurements|body-composition)(\/.*)?$/ };
/** Add and edit food (Nutrition). */
export const FOOD_PAGES: StackMount = { root: '/nutrition', tails: /^\/food\/[^/]+$/ };
/** A planned workout's details (the active workout is a full-screen route of its own and stays as it is). */
export const WORKOUT_DETAIL: StackMount = { root: '/workout', tails: /^\/session\/[^/]+$/ };

type Url = string | readonly unknown[] | unknown;

/** A link to a mounted page, in the stack at `base`; anything else unchanged. */
export function inStack<T extends Url>(url: T, base: string, mounts: readonly StackMount[] = [YOU_SECTIONS]): T {
  if (typeof url === 'string') {
    for (const { root, tails } of mounts) {
      if (url === root) {
        return base as T;
      }
      if (url.startsWith(`${root}/`) && tails.test(url.slice(root.length))) {
        return `${base}${url.slice(root.length)}` as T;
      }
    }
    return url;
  }
  if (Array.isArray(url) && url.every((part) => typeof part === 'string')) {
    const [first, ...rest] = url as string[];
    for (const { root, tails } of mounts) {
      if (first === root && (rest.length === 0 || tails.test(`/${rest.join('/')}`))) {
        return [base, ...rest] as T;
      }
    }
  }
  return url as T;
}

/**
 * For routes that mount pages of another tab inside this one (`mounts`): those pages keep navigating to their
 * own paths in code, and this keeps them in the tab they were opened from, so Back returns to where the user came
 * from instead of jumping tabs. Everything else is the app's one NavController (its direction and animation
 * state are shared with the router outlets).
 */
export function provideStackNav(base: string, mounts: readonly StackMount[] = [YOU_SECTIONS]): Provider {
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
            ? (url: Url, ...rest: unknown[]) => (value as (...args: unknown[]) => unknown).call(target, inStack(url, base, mounts), ...rest)
            : value.bind(target);
        },
      });
    },
  };
}
