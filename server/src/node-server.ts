import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { ExtractionHandler } from './extraction-handler';

const UNREAD_BODY_GRACE_MS = 2_000;

/**
 * Serves the Fetch-API handler over node:http. The request body is streamed
 * into the handler (which stops reading at the upload limit); nothing is
 * buffered here or written to disk.
 */
export function createNodeServer(handler: ExtractionHandler): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    serve(handler, req, res).catch(() => {
      // The handler answers every error itself; this is the transport failing.
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' });
      }
      res.end();
      req.destroy();
    });
  });
  // Bound slow uploads and idle connections.
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  return server;
}

/**
 * The request body as a web stream. Unlike `Readable.toWeb(req)`, cancelling
 * it (an upload over the limit) doesn't destroy the request and its socket,
 * which would drop the 413 answer: the rest of the body is discarded instead.
 */
function bodyStream(req: IncomingMessage): ReadableStream<Uint8Array> {
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      req.on('data', (chunk: Buffer) => {
        if (cancelled) {
          return;
        }
        controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
        if ((controller.desiredSize ?? 0) <= 0) {
          req.pause();
        }
      });
      req.once('end', () => cancelled || controller.close());
      req.once('error', (error) => cancelled || controller.error(error));
      req.pause();
    },
    pull() {
      req.resume();
    },
    cancel() {
      cancelled = true;
      req.resume();
    },
  });
}

async function serve(handler: ExtractionHandler, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  const request = new Request(new URL(req.url ?? '/', 'http://localhost'), {
    method: req.method,
    headers,
    body: hasBody ? bodyStream(req) : null,
    duplex: 'half',
  } as RequestInit);

  const response = await handler(request, { remoteAddress: req.socket.remoteAddress ?? 'unknown' });
  const body = Buffer.from(await response.arrayBuffer());
  const unreadBody = hasBody && !req.complete;
  res.writeHead(response.status, { ...Object.fromEntries(response.headers), 'content-length': String(body.length) });
  res.end(body);
  if (unreadBody) {
    // A rejected upload isn't read to the end. Closing the socket while the
    // client is still sending resets it, and the client can lose the answer
    // (`Connection: close` does this too: Node closes as soon as the answer is
    // written). So Node discards the rest of the body, for a bounded time; a
    // body still arriving after that is cut off.
    res.on('finish', () => setTimeout(() => req.destroy(), UNREAD_BODY_GRACE_MS).unref());
  }
}
