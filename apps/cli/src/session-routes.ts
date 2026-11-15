import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServiceError, ServiceResult, SessionService } from '@archwise/application';
import { json } from './http.js';

const PREFIX = '/api/v1/sessions';
const SESSION_ID = /^ses-[0-9a-f]{24}$/;
export const MAX_BODY_BYTES = 300_000;

const ERROR_STATUS: Readonly<Record<ServiceError, number>> = {
  'not-found': 404,
  'too-large': 413,
  'invalid-sandbox': 422,
  'invalid-label': 422,
};

export function isSessionRoute(pathname: string): boolean {
  return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`);
}

class BodyTooLarge extends Error {}

/** Reads a request body, aborting once the byte limit is exceeded. */
async function readBody(req: IncomingMessage): Promise<string> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send<T>(res: ServerResponse, result: ServiceResult<T>, map: (value: T) => unknown): void {
  if (result.ok) json(res, 200, map(result.value));
  else json(res, ERROR_STATUS[result.error], { error: result.error });
}

const notFound = (res: ServerResponse): void => json(res, 404, { error: 'Not found' });

/**
 * Session API behind the existing capability check. Mutations additionally require a
 * same-origin `Origin` header and a JSON content type. Responses never contain filesystem
 * paths and never echo identifiers or bodies that were rejected.
 */
export async function handleSessionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  context: { readonly sessions: SessionService | null; readonly origin: string },
): Promise<void> {
  const method = req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET');
  const { sessions } = context;

  if (pathname === `${PREFIX}/current` && method === 'GET') {
    json(
      res,
      200,
      sessions
        ? { ...sessions.current(), storeEnabled: true }
        : { id: null, persisted: false, storeEnabled: false },
    );
    return;
  }
  if (!sessions) {
    notFound(res);
    return;
  }
  if (pathname === PREFIX && method === 'GET') {
    json(res, 200, { sessions: sessions.list() });
    return;
  }

  const [id, action, ...rest] = pathname.slice(PREFIX.length + 1).split('/');
  if (!id || !SESSION_ID.test(id) || rest.length > 0) {
    notFound(res);
    return;
  }

  const mutating = method !== 'GET';
  if (mutating && req.headers.origin !== context.origin) {
    json(res, 403, { error: 'Same-origin request required' });
    return;
  }
  const needsBody = (action === 'sandbox' && method === 'PUT') || (!action && method === 'PATCH');
  let body = '';
  if (needsBody) {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      json(res, 415, { error: 'Content-Type must be application/json' });
      return;
    }
    try {
      body = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        json(res, 413, { error: 'too-large' });
        req.resume();
        return;
      }
      throw error;
    }
  }

  const withView = (detail: { view: string }) => ({
    ...detail,
    view: JSON.parse(detail.view) as unknown,
  });

  if (!action && method === 'GET') return send(res, sessions.get(id), withView);
  if (action === 'resume' && method === 'POST') return send(res, sessions.resume(id), withView);
  if (action === 'sandbox' && method === 'PUT') {
    return send(res, sessions.saveSandbox(id, body), (summary) => summary);
  }
  if (!action && method === 'PATCH') {
    let label: unknown;
    try {
      label = (JSON.parse(body) as { label?: unknown }).label;
    } catch {
      label = undefined;
    }
    if (typeof label !== 'string') {
      json(res, 422, { error: 'invalid-label' });
      return;
    }
    return send(res, sessions.rename(id, label), (summary) => summary);
  }
  if (!action && method === 'DELETE') {
    const result = sessions.delete(id);
    if (result.ok) {
      res.statusCode = 204;
      res.end();
    } else {
      json(res, ERROR_STATUS[result.error], { error: result.error });
    }
    return;
  }
  json(res, 405, { error: 'Method not allowed' });
}
