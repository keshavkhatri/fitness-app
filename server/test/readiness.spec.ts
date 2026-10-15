import { describe, expect, it, vi } from 'vitest';
import { createExtractionHandler } from '../src/extraction-handler';
import { config } from './fixtures';

const CONTEXT = { remoteAddress: '203.0.113.9' };
const handler = (readiness?: () => Promise<boolean>) => createExtractionHandler({ config: config(), client: null, log: () => undefined, readiness });
const get = (handle: ReturnType<typeof handler>, path: string, init?: RequestInit) => handle(new Request(`http://localhost${path}`, init), CONTEXT);

describe('GET /ready (database readiness)', () => {
  it('answers 200 ready when the database check passes', async () => {
    const response = await get(handler(async () => true), '/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 503 unavailable when the check fails, and says nothing more', async () => {
    const response = await get(handler(async () => false), '/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('answers 503 and leaks nothing when the check throws', async () => {
    const throwing = async () => {
      throw new Error('connect ECONNREFUSED 10.1.2.3:5432 for user app_user password=s3cret relation "pulseform.user_profiles"');
    };
    const response = await get(handler(throwing), '/ready');
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toBe('{"status":"unavailable"}');
    expect(text).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|s3cret|app_user|pulseform/);
  });

  it('is unavailable, not an error, when no database is configured', async () => {
    const response = await get(handler(undefined), '/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('answers only GET', async () => {
    const readiness = vi.fn(async () => true);
    const response = await get(handler(readiness), '/ready', { method: 'POST' });
    expect(response.status).toBe(404);
    expect(readiness).not.toHaveBeenCalled();
  });
});

describe('GET /health is unchanged and never touches the database', () => {
  it('answers ok even when the database is down or its check would throw', async () => {
    const readiness = vi.fn(async () => {
      throw new Error('database down');
    });
    const response = await get(handler(readiness), '/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(readiness).not.toHaveBeenCalled();
  });
});
