import { inBodyExtractionRequest, readInBodyExtractionResponse } from '../../src/app/domain/inbody-extraction';
import { ServerConfig } from './config';
import { ResponsesClient } from './openai-client';
import { FixedWindowLimiter } from './rate-limiter';
import { UploadProblem, readReportUpload } from './report-upload';

/**
 * `POST /v1/inbody-extractions`: one InBody report image in, the validated
 * `inbody-extraction.v1` JSON out (see server/README.md). A Web-standard
 * Request → Response function, so it runs behind node:http (node-server.ts)
 * or any Fetch-API runtime.
 *
 * Privacy: the image and the extraction exist only in memory for the
 * duration of the request. Nothing is written to disk; logs carry event
 * names, status codes, outcomes and durations only, never the image,
 * extracted values, client addresses or provider messages; error responses
 * are fixed texts. The server never saves a profile or weight: the app
 * shows the extraction for review.
 */

export const EXTRACTION_PATH = '/v1/inbody-extractions';
export const HEALTH_PATH = '/health';
/** Whether the database answers. Unlike /health (which never touches it), this one does. */
export const READY_PATH = '/ready';

export type LogFields = Readonly<Record<string, string | number | boolean>>;
export type Log = (event: string, fields?: LogFields) => void;

export interface ExtractionHandlerDeps {
  readonly config: ServerConfig;
  /** null when the server has no OpenAI key/model: every extraction is `not-configured`. */
  readonly client: ResponsesClient | null;
  readonly log: Log;
  readonly now?: () => number;
  /** Whether the database is reachable (cached by the database module); undefined when none is configured. */
  readonly readiness?: () => Promise<boolean>;
}

/** What the transport knows about the caller. */
export interface RequestContext {
  readonly remoteAddress: string;
}

export type ErrorCode =
  | UploadProblem
  | 'not-found'
  | 'method-not-allowed'
  | 'origin-not-allowed'
  | 'rate-limited'
  | 'service-limit-reached'
  | 'server-busy'
  | 'not-configured'
  | 'extraction-refused'
  | 'extraction-incomplete'
  | 'invalid-extraction'
  | 'provider-timeout'
  | 'provider-unavailable'
  | 'provider-error'
  | 'internal-error';

const DAY_MS = 24 * 60 * 60_000;
/** Suggested wait when every extraction slot is taken (uploads usually finish within seconds). */
export const BUSY_RETRY_AFTER_SECONDS = 10;
const MANUAL = 'Try again later or enter your details manually.';

function errorStatus(code: ErrorCode): number {
  switch (code) {
    case 'empty-upload':
    case 'invalid-image':
      return 400;
    case 'origin-not-allowed':
      return 403;
    case 'not-found':
      return 404;
    case 'method-not-allowed':
      return 405;
    case 'upload-too-large':
      return 413;
    case 'unsupported-media-type':
      return 415;
    case 'extraction-refused':
      return 422;
    case 'rate-limited':
    case 'service-limit-reached':
      return 429;
    case 'internal-error':
      return 500;
    case 'extraction-incomplete':
    case 'invalid-extraction':
    case 'provider-error':
      return 502;
    case 'not-configured':
    case 'server-busy':
    case 'provider-unavailable':
      return 503;
    case 'provider-timeout':
      return 504;
  }
}

function errorMessage(code: ErrorCode, maxUploadBytes: number): string {
  switch (code) {
    case 'unsupported-media-type':
      return 'Upload a PNG, JPEG or WEBP image of the report.';
    case 'empty-upload':
      return 'The upload was empty. Choose the report image again.';
    case 'upload-too-large':
      return `The image is larger than ${Math.floor(maxUploadBytes / (1024 * 1024)) || 1} MB. Upload a smaller photo or screenshot of the report.`;
    case 'invalid-image':
      return "The file isn't a valid PNG, JPEG or WEBP image. Choose the report image again.";
    case 'not-found':
      return 'Not found.';
    case 'method-not-allowed':
      return 'Method not allowed.';
    case 'origin-not-allowed':
      return "This app isn't allowed to use the report extraction service.";
    case 'rate-limited':
      return `Too many uploads. ${MANUAL}`;
    case 'service-limit-reached':
      return `Report extraction has reached its limit for now. ${MANUAL}`;
    case 'server-busy':
      return `Report extraction is busy right now. ${MANUAL}`;
    case 'not-configured':
      return "Report extraction isn't available right now. Enter your details manually.";
    case 'extraction-refused':
      return 'The AI service declined to read this image. Enter your details manually.';
    case 'extraction-incomplete':
      return `The AI service couldn't finish reading the report. ${MANUAL}`;
    case 'invalid-extraction':
      return `The AI service returned a result that couldn't be used. ${MANUAL}`;
    case 'provider-timeout':
      return `The AI service took too long to respond. ${MANUAL}`;
    case 'provider-unavailable':
      return `The AI service is busy or unavailable. ${MANUAL}`;
    case 'provider-error':
    case 'internal-error':
      return `Something went wrong while reading the report. ${MANUAL}`;
  }
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const;

export function createExtractionHandler({ config, client, log, now = Date.now, readiness }: ExtractionHandlerDeps) {
  const clientLimiter = new FixedWindowLimiter(config.clientRateLimit, config.clientRateWindowMs, now);
  const dailyLimiter = new FixedWindowLimiter(config.dailyExtractionLimit, DAY_MS, now);
  /** Extractions holding a slot. Checked and taken synchronously (no await in between), so concurrent requests can't overshoot. */
  let inFlight = 0;

  const corsHeaders = (origin: string | null): Record<string, string> =>
    origin && config.allowedOrigins.includes(origin)
      ? { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'Retry-After', vary: 'Origin' }
      : { vary: 'Origin' };

  const json = (status: number, body: unknown, origin: string | null, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...BASE_HEADERS, ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8', ...headers },
    });

  const fail = (code: ErrorCode, origin: string | null, headers: Record<string, string> = {}) => {
    const status = errorStatus(code);
    log('extraction.rejected', { status, code });
    return json(status, { error: { code, message: errorMessage(code, config.maxUploadBytes) } }, origin, headers);
  };

  const retryAfter = (ms: number) => ({ 'retry-after': String(Math.max(1, Math.ceil(ms / 1000))) });

  /** The configured proxy header (its last entry: the hop the proxy itself saw), else the socket address. */
  const clientKey = (request: Request, context: RequestContext): string => {
    const forwarded = config.clientIpHeader ? request.headers.get(config.clientIpHeader) : null;
    return forwarded?.split(',').pop()?.trim() || context.remoteAddress;
  };

  async function extract(request: Request, context: RequestContext, origin: string | null): Promise<Response> {
    const limited = clientLimiter.take(clientKey(request, context));
    if (!limited.allowed) {
      return fail('rate-limited', origin, retryAfter(limited.retryAfterMs));
    }
    if (!client || !config.openAi) {
      return fail('not-configured', origin);
    }
    // Before anything is read: a request without a slot never buffers its upload.
    if (inFlight >= config.maxConcurrentExtractions) {
      return fail('server-busy', origin, { 'retry-after': String(BUSY_RETRY_AFTER_SECONDS) });
    }
    inFlight += 1;
    try {
      return await extractWithSlot(request, origin, client, config.openAi);
    } finally {
      // Every outcome releases the slot: answers, rejections, exceptions, aborted uploads, provider timeouts.
      inFlight -= 1;
    }
  }

  async function extractWithSlot(
    request: Request,
    origin: string | null,
    client: ResponsesClient,
    openAi: NonNullable<ServerConfig['openAi']>,
  ): Promise<Response> {
    const upload = await readReportUpload(request, config.maxUploadBytes);
    if (!upload.ok) {
      return fail(upload.problem, origin);
    }
    const built = inBodyExtractionRequest(
      { mediaType: upload.mediaType, base64: Buffer.from(upload.bytes.buffer, upload.bytes.byteOffset, upload.bytes.byteLength).toString('base64') },
      { model: openAi.model, maxOutputTokens: openAi.maxOutputTokens },
    );
    if (!built.ok) {
      return fail(built.problem === 'invalid-image' ? 'invalid-image' : 'internal-error', origin);
    }
    const budget = dailyLimiter.take('all');
    if (!budget.allowed) {
      return fail('service-limit-reached', origin, retryAfter(budget.retryAfterMs));
    }

    const started = now();
    const provided = await client.create(built.body);
    const durationMs = now() - started;
    if (!provided.ok) {
      log('extraction.provider-failed', { failure: provided.failure, status: provided.status ?? 0, durationMs });
      if (provided.failure === 'timeout') {
        return fail('provider-timeout', origin);
      }
      const unavailable = provided.failure === 'rate-limited' || (provided.status ?? 0) >= 500;
      return fail(unavailable ? 'provider-unavailable' : 'provider-error', origin);
    }
    const read = readInBodyExtractionResponse(provided.body);
    switch (read.kind) {
      case 'extraction':
        log('extraction.completed', { status: 200, outcome: read.extraction.outcome, durationMs });
        return json(200, read.extraction, origin);
      case 'refused':
        return fail('extraction-refused', origin);
      case 'incomplete':
        log('extraction.incomplete', { reason: read.reason, durationMs });
        return fail('extraction-incomplete', origin);
      case 'invalid-output':
        // Error paths only (e.g. `measurements.weight.unit`), never the values.
        log('extraction.invalid-output', { errorCount: read.errors.length, paths: read.errors.slice(0, 10).map((e) => e.path).join(' ') });
        return fail('invalid-extraction', origin);
      case 'failed':
        return fail('provider-error', origin);
    }
  }

  return async function handle(request: Request, context: RequestContext): Promise<Response> {
    const origin = request.headers.get('origin') || null;
    try {
      const { pathname } = new URL(request.url);
      if (pathname === HEALTH_PATH && request.method === 'GET') {
        return json(200, { status: 'ok' }, null);
      }
      if (pathname === READY_PATH && request.method === 'GET') {
        // Up or down and nothing else: no host, schema, SQL or error text, whatever went wrong.
        const ready = readiness ? await readiness().catch(() => false) : false;
        return json(ready ? 200 : 503, { status: ready ? 'ready' : 'unavailable' }, null);
      }
      if (pathname !== EXTRACTION_PATH) {
        return fail('not-found', origin);
      }
      // No Origin: not a browser/WebView (CORS can't restrict those anyway); still rate limited.
      if (origin !== null && !config.allowedOrigins.includes(origin)) {
        return fail('origin-not-allowed', origin);
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...BASE_HEADERS,
            ...corsHeaders(origin),
            'access-control-allow-methods': 'POST',
            'access-control-allow-headers': 'Content-Type',
            'access-control-max-age': '600',
          },
        });
      }
      if (request.method !== 'POST') {
        return fail('method-not-allowed', origin, { allow: 'POST, OPTIONS' });
      }
      return await extract(request, context, origin);
    } catch (error) {
      log('extraction.error', { errorName: error instanceof Error ? error.name : typeof error });
      return fail('internal-error', origin);
    }
  };
}

export type ExtractionHandler = ReturnType<typeof createExtractionHandler>;
