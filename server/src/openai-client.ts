/**
 * The one call to OpenAI: `POST /v1/responses` with a body built by
 * `inBodyExtractionRequest`. Injected into the handler so tests never reach
 * the network. Failures carry no provider text: it may echo the request.
 */

export type ProviderResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly failure: 'timeout' | 'network' | 'rate-limited' | 'http-error'; readonly status?: number };

export interface ResponsesClient {
  create(body: Readonly<Record<string, unknown>>): Promise<ProviderResult>;
}

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export function openAiResponsesClient(
  { apiKey, timeoutMs }: { readonly apiKey: string; readonly timeoutMs: number },
  fetchImpl: typeof fetch = fetch,
): ResponsesClient {
  return {
    async create(body) {
      let response: Response;
      try {
        response = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return { ok: false, failure: timedOut ? 'timeout' : 'network' };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, failure: response.status === 429 ? 'rate-limited' : 'http-error', status: response.status };
      }
      try {
        return { ok: true, body: await response.json() };
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
        // A body that isn't JSON is read like any malformed response.
        return timedOut ? { ok: false, failure: 'timeout' } : { ok: true, body: null };
      }
    },
  };
}
