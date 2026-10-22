import type { AccountRoutes } from './account/account-routes';
import type { AuthRoutes } from './auth/auth-routes';
import type { ExtractionHandler, RequestContext } from './extraction-handler';
import type { PushRoutes } from './push/push-routes';

/**
 * The server's single entry: account routes (/api/auth/*, /v1/auth/*) go to the auth routes, push device routes (/v1/push/*) to the push routes,
 * deleting one's account (/v1/account/*) to the account routes;
 * everything else (/health, /ready, InBody extraction, 404s) to the extraction handler, unchanged.
 */
export function createAppHandler({
  extraction,
  authRoutes,
  pushRoutes,
  accountRoutes,
}: {
  extraction: ExtractionHandler;
  authRoutes: AuthRoutes;
  pushRoutes?: PushRoutes;
  accountRoutes?: AccountRoutes;
}) {
  return async function handle(request: Request, context: RequestContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (authRoutes.owns(pathname)) {
      return authRoutes.handle(request, context);
    }
    if (accountRoutes?.owns(pathname)) {
      return accountRoutes.handle(request, context);
    }
    return pushRoutes?.owns(pathname) ? pushRoutes.handle(request, context) : extraction(request, context);
  };
}

export type AppHandler = ReturnType<typeof createAppHandler>;
