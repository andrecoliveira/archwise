import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ArchitectureGraph } from './graph.js';

const HOST = '127.0.0.1';
const MAX_PATH_LENGTH = 2048;
const MAX_COOKIE_LENGTH = 4096;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const ASSET_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface LocalServer {
  readonly address: string;
  readonly bootstrapUrl: string;
  readonly port: number;
  close(): Promise<void>;
}
export interface ServerOptions {
  readonly webDistPath?: string;
}

function equalSecret(value: string | undefined, secret: string): boolean {
  if (!value) return false;
  const a = Buffer.from(value, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function securityHeaders(res: ServerResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
}

function json(res: ServerResponse, status: number, payload: unknown, head = false): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(head ? undefined : JSON.stringify(payload));
}

function authorized(req: IncomingMessage, secret: string): boolean {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ') && equalSecret(auth.slice(7), secret)) return true;
  const raw = req.headers.cookie;
  if (!raw || raw.length > MAX_COOKIE_LENGTH) return false;
  const cookie = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('archwise_session='));
  return equalSecret(cookie?.slice('archwise_session='.length), secret);
}

async function asset(
  res: ServerResponse,
  rootInput: string,
  pathname: string,
  head: boolean,
): Promise<void> {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (
    !file ||
    file.includes('\\') ||
    file.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))
  ) {
    json(res, 404, { error: 'Not found' }, head);
    return;
  }
  const mime = ASSET_TYPES[extname(file).toLowerCase()];
  if (!mime) {
    json(res, 404, { error: 'Not found' }, head);
    return;
  }
  try {
    const root = await realpath(rootInput);
    const target = await realpath(resolve(root, file));
    const rel = relative(root, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) {
      json(res, 404, { error: 'Not found' }, head);
      return;
    }
    const info = await stat(target);
    if (!info.isFile() || info.size > MAX_ASSET_BYTES) {
      json(res, 404, { error: 'Not found' }, head);
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.end(head ? undefined : await readFile(target));
  } catch {
    json(res, 404, { error: 'Not found' }, head);
  }
}

/** Bind a read-only API on loopback; never expose workspace filesystem paths as routes. */
export async function startLocalGraphServer(
  graph: ArchitectureGraph,
  options: ServerOptions = {},
): Promise<LocalServer> {
  if (options.webDistPath) {
    try {
      if (!(await stat(resolve(options.webDistPath, 'index.html'))).isFile())
        throw new Error('Invalid assets');
    } catch {
      throw new Error(
        'Browser assets unavailable. Build @archwise/web before starting the Studio.',
      );
    }
  }
  const session = randomBytes(32).toString('hex');
  const bootstrap = randomBytes(32).toString('hex');
  let bootstrapUsed = false;
  let address = '';
  const server = createServer((req, res) => {
    void (async () => {
      securityHeaders(res);
      if (!req.url || req.url.length > MAX_PATH_LENGTH) {
        json(res, 400, { error: 'Invalid request' });
        return;
      }
      if (req.headers.host !== address) {
        json(res, 403, { error: 'Invalid host' });
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== `http://${address}`) {
        json(res, 403, { error: 'Invalid origin' });
        return;
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') {
        json(res, 403, { error: 'Cross-site denied' });
        return;
      }
      const head = req.method === 'HEAD';
      if (req.method !== 'GET' && !head) {
        json(res, 405, { error: 'Method not allowed' });
        return;
      }
      let url: URL;
      try {
        url = new URL(req.url, `http://${address}`);
      } catch {
        json(res, 400, { error: 'Invalid URL' });
        return;
      }
      if (url.pathname.startsWith('/session/')) {
        const submitted = url.pathname.slice('/session/'.length);
        if (
          req.method !== 'GET' ||
          bootstrapUsed ||
          url.search ||
          !equalSecret(submitted, bootstrap)
        ) {
          json(res, 403, { error: 'Invalid or used bootstrap token' });
          return;
        }
        bootstrapUsed = true;
        res.statusCode = 303;
        res.setHeader(
          'Set-Cookie',
          `archwise_session=${session}; HttpOnly; SameSite=Strict; Path=/`,
        );
        res.setHeader('Location', '/');
        res.end();
        return;
      }
      if (!authorized(req, session)) {
        json(res, 401, { error: 'Unauthorized' }, head);
        return;
      }
      if (url.search) {
        json(res, 400, { error: 'Query parameters not supported' }, head);
        return;
      }
      if (url.pathname === '/api/v1/graph') {
        json(res, 200, graph, head);
        return;
      }
      if (url.pathname === '/api/v1/health') {
        json(res, 200, { name: 'archwise', status: 'ready', graphVersion: graph.version }, head);
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        json(res, 404, { error: 'Not found' }, head);
        return;
      }
      if (options.webDistPath) {
        await asset(res, options.webDistPath, url.pathname, head);
        return;
      }
      json(res, 503, { error: 'Browser bundle is not built; API is ready' }, head);
    })().catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
      else res.end();
    });
  });
  try {
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(0, HOST, () => {
        server.off('error', reject);
        accept();
      });
    });
    const port = (server.address() as AddressInfo).port;
    address = `${HOST}:${port}`;
    return Object.freeze({
      address: `http://${address}`,
      bootstrapUrl: `http://${address}/session/${bootstrap}`,
      port,
      close: () =>
        new Promise<void>((accept, reject) =>
          server.close((error) => (error ? reject(error) : accept())),
        ),
    });
  } catch (error) {
    server.close();
    throw error;
  }
}
