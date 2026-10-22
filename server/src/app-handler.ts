import type { AccountRoutes } from './account/account-routes';
import type { AuthRoutes } from './auth/auth-routes';
import type { ExtractionHandler, RequestContext } from './extraction-handler';
import type { PushRoutes } from './push/push-routes';
import type { SyncRoutes } from './sync/sync-routes';

/**
 * The server's single entry: account routes (/api/auth/*, /v1/auth/*) go to the auth routes, push device routes (/v1/push/*) to the push routes,
 * deleting one's account (/v1/account/*) to the account routes, cloud backup and sync (/v1/sync/*) to the sync routes;
 * everything else (/health, /ready, InBody extraction, 404s) to the extraction handler, unchanged.
 */
export function createAppHandler({
  extraction,
  authRoutes,
  pushRoutes,
  accountRoutes,
  syncRoutes,
}: {
  extraction: ExtractionHandler;
  authRoutes: AuthRoutes;
  pushRoutes?: PushRoutes;
  accountRoutes?: AccountRoutes;
  syncRoutes?: SyncRoutes;
}) {
  return async function handle(request: Request, context: RequestContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (authRoutes.owns(pathname)) {
      return authRoutes.handle(request, context);
    }
    if (syncRoutes?.owns(pathname)) {
      return syncRoutes.handle(request, context);
    }
    if (accountRoutes?.owns(pathname)) {
      return accountRoutes.handle(request, context);
    }
    return pushRoutes?.owns(pathname) ? pushRoutes.handle(request, context) : extraction(request, context);
  };
}

export type AppHandler = ReturnType<typeof createAppHandler>;
