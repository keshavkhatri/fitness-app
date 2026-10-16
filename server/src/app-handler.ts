import type { AuthRoutes } from './auth/auth-routes';
import type { ExtractionHandler, RequestContext } from './extraction-handler';

/**
 * The server's single entry: account routes (/api/auth/*, /v1/auth/*) go to the auth routes;
 * everything else (/health, /ready, InBody extraction, 404s) to the extraction handler, unchanged.
 */
export function createAppHandler({ extraction, authRoutes }: { extraction: ExtractionHandler; authRoutes: AuthRoutes }) {
  return async function handle(request: Request, context: RequestContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    return authRoutes.owns(pathname) ? authRoutes.handle(request, context) : extraction(request, context);
  };
}

export type AppHandler = ReturnType<typeof createAppHandler>;
