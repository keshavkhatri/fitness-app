import { describe, expect, it, vi } from 'vitest';
import { OPENAI_RESPONSES_URL, openAiResponsesClient } from '../src/openai-client';
import { API_KEY } from './fixtures';

const BODY = { model: 'm', store: false };
const client = (fetchImpl: typeof fetch) => openAiResponsesClient({ apiKey: API_KEY, timeoutMs: 5000 }, fetchImpl);

describe('OpenAI Responses client', () => {
  it('posts the body to /v1/responses with the server-side key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ status: 'completed' }));
    expect(await client(fetchImpl).create(BODY)).toEqual({ ok: true, body: { status: 'completed' } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(OPENAI_RESPONSES_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual(BODY);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [429, { ok: false, failure: 'rate-limited', status: 429 }],
    [500, { ok: false, failure: 'http-error', status: 500 }],
    [401, { ok: false, failure: 'http-error', status: 401 }],
  ])('reports HTTP %i without the provider message', async (status, expected) => {
    const result = await client(async () => Response.json({ error: { message: `Incorrect API key ${API_KEY}` } }, { status })).create(BODY);
    expect(result).toEqual(expected);
  });

  it('distinguishes timeouts from network failures', async () => {
    const timeout = client(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    expect(await timeout.create(BODY)).toEqual({ ok: false, failure: 'timeout' });
    const offline = client(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await offline.create(BODY)).toEqual({ ok: false, failure: 'network' });
  });

  it('passes a body that is not JSON on as unreadable', async () => {
    expect(await client(async () => new Response('<html>gateway</html>')).create(BODY)).toEqual({ ok: true, body: null });
  });
});
