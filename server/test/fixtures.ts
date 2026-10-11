import { ServerConfig, loadConfig } from '../src/config';
import { ExtractionHandler, Log, LogFields, createExtractionHandler } from '../src/extraction-handler';
import { ProviderResult, ResponsesClient } from '../src/openai-client';

export const API_KEY = 'sk-test-secret-key-never-shown';
export const APP_ORIGIN = 'http://localhost:8100';

export const config = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...loadConfig({ OPENAI_API_KEY: API_KEY, OPENAI_MODEL: 'test-vision-model', ALLOWED_ORIGINS: APP_ORIGIN }),
  ...overrides,
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A PNG signature followed by recognisable "report" bytes. */
export const pngBytes = (size = 64): Uint8Array => {
  const bytes = new Uint8Array(size).fill(0x41);
  bytes.set(PNG_SIGNATURE);
  return bytes;
};
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
export const WEBP_BYTES = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBPVP8 '].map((c) => c.charCodeAt(0))));

export const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/** A raw Responses API body with one assistant message. */
export const completed = (...content: unknown[]) => ({
  id: 'resp_1',
  status: 'completed',
  error: null,
  incomplete_details: null,
  output: [{ type: 'message', role: 'assistant', status: 'completed', content }],
});
export const outputText = (text: string) => ({ type: 'output_text', text, annotations: [] });

export class FakeResponsesClient implements ResponsesClient {
  readonly requests: Readonly<Record<string, unknown>>[] = [];
  constructor(public result: ProviderResult) {}
  async create(body: Readonly<Record<string, unknown>>): Promise<ProviderResult> {
    this.requests.push(body);
    return this.result;
  }
}

export interface Harness {
  readonly handle: ExtractionHandler;
  readonly client: FakeResponsesClient;
  readonly logs: { event: string; fields?: LogFields }[];
  readonly clock: { now: number };
}

export function harness(
  result: ProviderResult,
  options: { config?: Partial<ServerConfig>; noClient?: boolean } = {},
): Harness {
  const client = new FakeResponsesClient(result);
  const logs: Harness['logs'] = [];
  const log: Log = (event, fields) => logs.push({ event, fields });
  const clock = { now: 1_000_000 };
  const handle = createExtractionHandler({
    config: config(options.config),
    client: options.noClient ? null : client,
    log,
    now: () => clock.now,
  });
  return { handle, client, logs, clock };
}

export const upload = (body: RequestInit['body'], headers: Record<string, string> = {}) =>
  new Request('http://localhost/v1/inbody-extractions', {
    method: 'POST',
    headers: { 'content-type': 'image/png', origin: APP_ORIGIN, ...headers },
    body,
    duplex: 'half',
  } as RequestInit);

export const CONTEXT = { remoteAddress: '203.0.113.7' };
