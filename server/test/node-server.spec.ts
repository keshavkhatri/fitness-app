import { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { SAMPLE_INBODY380_EXTRACTION } from '../../src/app/domain/inbody-extraction/testing/sample-inbody380-extraction';
import { createNodeServer } from '../src/node-server';
import { APP_ORIGIN, completed, harness, outputText, pngBytes } from './fixtures';

const servers: ReturnType<typeof createNodeServer>[] = [];
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

async function start(maxUploadBytes = 8 * 1024 * 1024) {
  const { handle, client } = harness(
    { ok: true, body: completed(outputText(JSON.stringify(SAMPLE_INBODY380_EXTRACTION))) },
    { config: { maxUploadBytes } },
  );
  const server = createNodeServer(handle);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/inbody-extractions`, client };
}

describe('node:http adapter', () => {
  it('serves an extraction over HTTP', async () => {
    const { url } = await start();
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'image/png', origin: APP_ORIGIN }, body: pngBytes(4096) });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(await response.json()).toEqual(SAMPLE_INBODY380_EXTRACTION);
  });

  it('stops reading a chunked upload over the limit and still delivers the 413', async () => {
    const { url, client } = await start(64 * 1024);
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(url, { method: 'POST', headers: { 'content-type': 'image/png', 'transfer-encoding': 'chunked' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          answered = true;
          resolve({ status: res.statusCode ?? 0, body });
        });
      });
      let answered = false;
      // Writing on after the answer may fail once the server closes: expected.
      req.on('error', (error) => (answered ? undefined : reject(error)));
      // Keep sending (up to 1 MB) until the server answers.
      let sent = 0;
      const pump = () => {
        if (answered) {
          req.destroy();
          return;
        }
        while (sent < 1024 * 1024 && req.write(pngBytes(16 * 1024))) {
          sent += 16 * 1024;
        }
        if (sent < 1024 * 1024) {
          req.once('drain', () => {
            sent += 16 * 1024;
            pump();
          });
        } else {
          req.end();
        }
      };
      pump();
    });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body).error.code).toBe('upload-too-large');
    expect(client.requests).toHaveLength(0);
  });

  it('cuts off an upload that keeps arriving after the 413', async () => {
    const { url } = await start(64 * 1024);
    const outcome = await new Promise<{ status: number; closed: boolean }>((resolve) => {
      let status = 0;
      const req = httpRequest(url, { method: 'POST', headers: { 'content-type': 'image/png', 'transfer-encoding': 'chunked' } }, (res) => {
        status = res.statusCode ?? 0;
        res.resume();
      });
      // Never ends: only the server can stop it.
      const timer = setInterval(() => req.write(pngBytes(16 * 1024)), 20);
      const done = (closed: boolean) => {
        clearInterval(timer);
        req.destroy();
        resolve({ status, closed });
      };
      req.on('close', () => done(true));
      setTimeout(() => done(false), 6_000).unref();
    });
    expect(outcome).toEqual({ status: 413, closed: true });
  }, 10_000);

  it('answers the CORS preflight', async () => {
    const { url } = await start();
    const response = await fetch(url, { method: 'OPTIONS', headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' } });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
  });
});
