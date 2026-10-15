import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';

describe('server configuration', () => {
  it('uses safe defaults', () => {
    expect(loadConfig({ OPENAI_API_KEY: 'k', OPENAI_MODEL: 'm' })).toEqual({
      openAi: { apiKey: 'k', model: 'm', maxOutputTokens: 8000, timeoutMs: 90_000 },
      maxUploadBytes: 8 * 1024 * 1024,
      maxConcurrentExtractions: 4,
      allowedOrigins: [],
      clientRateLimit: 5,
      clientRateWindowMs: 15 * 60_000,
      dailyExtractionLimit: 200,
      clientIpHeader: null,
      host: '127.0.0.1',
      port: 8787,
    });
  });

  it('listens on loopback by default, on all interfaces in production, and on the port it is given', () => {
    expect(loadConfig({}).host).toBe('127.0.0.1');
    expect(loadConfig({ NODE_ENV: 'production' }).host).toBe('0.0.0.0');
    expect(loadConfig({ NODE_ENV: 'production', HOST: '10.0.0.5' }).host).toBe('10.0.0.5');
    expect(loadConfig({ NODE_ENV: 'production', PORT: '8080' }).port).toBe(8080);
  });

  it.each([
    ['no key', { OPENAI_MODEL: 'm' }],
    ['no model', { OPENAI_API_KEY: 'k' }],
    ['a blank key', { OPENAI_API_KEY: '  ', OPENAI_MODEL: 'm' }],
  ])('is not configured for extraction with %s', (_, env) => {
    expect(loadConfig(env).openAi).toBeNull();
  });

  it('reads exact allowed origins', () => {
    expect(loadConfig({ ALLOWED_ORIGINS: 'https://app.example, capacitor://localhost ,http://localhost:8100' }).allowedOrigins).toEqual([
      'https://app.example',
      'capacitor://localhost',
      'http://localhost:8100',
    ]);
  });

  it.each(['*', 'null', 'https://app.example/path', 'app.example'])('rejects the origin %s', (origin) => {
    expect(() => loadConfig({ ALLOWED_ORIGINS: origin })).toThrow(ConfigError);
  });

  it('rejects invalid numbers, naming the variable but never its value', () => {
    expect(() => loadConfig({ INBODY_MAX_UPLOAD_BYTES: 'sk-looks-secret' })).toThrow(/^INBODY_MAX_UPLOAD_BYTES must be/);
    expect(() => loadConfig({ INBODY_MAX_UPLOAD_BYTES: 'sk-looks-secret' })).not.toThrow(/sk-looks-secret/);
    expect(() => loadConfig({ INBODY_MAX_UPLOAD_BYTES: String(64 * 1024 * 1024) })).toThrow(ConfigError);
    expect(() => loadConfig({ RATE_LIMIT_PER_CLIENT: '0' })).toThrow(ConfigError);
    expect(() => loadConfig({ MAX_CONCURRENT_EXTRACTIONS: '0' })).toThrow(/^MAX_CONCURRENT_EXTRACTIONS must be/);
    expect(() => loadConfig({ MAX_CONCURRENT_EXTRACTIONS: '101' })).toThrow(ConfigError);
  });

  it('reads the concurrent extraction limit', () => {
    expect(loadConfig({ MAX_CONCURRENT_EXTRACTIONS: '12' }).maxConcurrentExtractions).toBe(12);
  });
});
