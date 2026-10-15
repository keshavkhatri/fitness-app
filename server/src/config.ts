/**
 * Server configuration, read from environment variables only. The OpenAI key
 * lives here and nowhere else: it is never sent to the app, logged or
 * returned. See server/README.md for every variable.
 */

export interface OpenAiConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}

export interface ServerConfig {
  /** null when the key or model is missing: extraction requests then get `not-configured`. */
  readonly openAi: OpenAiConfig | null;
  readonly maxUploadBytes: number;
  /**
   * Extractions in progress at once (each holds an upload in memory while it is
   * read, encoded and sent): further requests get 503 server-busy.
   */
  readonly maxConcurrentExtractions: number;
  /** Exact origins allowed to call the endpoint from a browser/WebView. */
  readonly allowedOrigins: readonly string[];
  /** Extraction attempts per client per window. */
  readonly clientRateLimit: number;
  readonly clientRateWindowMs: number;
  /** Provider calls across all clients per day: a ceiling on cost and abuse. */
  readonly dailyExtractionLimit: number;
  /** Header set by a trusted proxy holding the client IP; null to use the socket address. */
  readonly clientIpHeader: string | null;
  readonly host: string;
  readonly port: number;
}

const MIB = 1024 * 1024;
/** OpenAI accepts larger images, but a phone photo of a report never needs more. */
export const MAX_UPLOAD_BYTES_CEILING = 20 * MIB;

type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {}

const text = (env: Env, name: string): string | null => {
  const value = env[name]?.trim();
  return value ? value : null;
};

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = text(env, name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max) {
    // The variable's name only: values may be secrets in a misconfigured environment.
    throw new ConfigError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function origins(env: Env): string[] {
  const list = (text(env, 'ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of list) {
    if (origin === '*' || origin === 'null' || !/^[a-z][a-z0-9+.-]*:\/\/[^/\s]+$/i.test(origin)) {
      throw new ConfigError('ALLOWED_ORIGINS must list exact origins (scheme://host[:port]), comma-separated; "*" is not allowed.');
    }
  }
  return list;
}

export function loadConfig(env: Env): ServerConfig {
  const apiKey = text(env, 'OPENAI_API_KEY');
  const model = text(env, 'OPENAI_MODEL');
  return {
    openAi:
      apiKey && model
        ? {
            apiKey,
            model,
            maxOutputTokens: integer(env, 'OPENAI_MAX_OUTPUT_TOKENS', 8000, 1000, 64000),
            timeoutMs: integer(env, 'OPENAI_TIMEOUT_MS', 90_000, 5_000, 300_000),
          }
        : null,
    maxUploadBytes: integer(env, 'INBODY_MAX_UPLOAD_BYTES', 8 * MIB, 1024, MAX_UPLOAD_BYTES_CEILING),
    maxConcurrentExtractions: integer(env, 'MAX_CONCURRENT_EXTRACTIONS', 4, 1, 100),
    allowedOrigins: origins(env),
    clientRateLimit: integer(env, 'RATE_LIMIT_PER_CLIENT', 5, 1, 1000),
    clientRateWindowMs: integer(env, 'RATE_LIMIT_WINDOW_MS', 15 * 60_000, 1_000, 24 * 60 * 60_000),
    dailyExtractionLimit: integer(env, 'DAILY_EXTRACTION_LIMIT', 200, 1, 1_000_000),
    clientIpHeader: text(env, 'CLIENT_IP_HEADER')?.toLowerCase() ?? null,
    // Loopback for local runs; a container (Cloud Run) must listen on every interface.
    host: text(env, 'HOST') ?? (text(env, 'NODE_ENV') === 'production' ? '0.0.0.0' : '127.0.0.1'),
    port: integer(env, 'PORT', 8787, 0, 65535),
  };
}
