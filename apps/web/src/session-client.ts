/** Typed client for the loopback session API. Never throws; failures are values. */

export interface CurrentSession {
  readonly id: string | null;
  readonly persisted: boolean;
  readonly storeEnabled: boolean;
}

export interface SessionSummary {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly componentCount: number;
  readonly hasSnapshots: boolean;
  readonly baseIsCurrent: boolean;
}

export interface SessionDetail extends SessionSummary {
  readonly sandbox: string;
  readonly view: unknown;
}

export type ClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly error: string };

type Fetch = typeof fetch;
const BASE = '/api/v1/sessions';

async function request<T>(
  f: Fetch,
  path: string,
  init: RequestInit & { readonly jsonBody?: string },
  map: (payload: unknown) => T,
): Promise<ClientResult<T>> {
  const { jsonBody, ...rest } = init;
  let response: Response;
  try {
    response = await f(path, {
      ...rest,
      credentials: 'same-origin',
      ...(jsonBody === undefined
        ? {}
        : { body: jsonBody, headers: { 'Content-Type': 'application/json' } }),
    });
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
  if (response.status === 204) return { ok: true, value: map(null) };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : `HTTP ${response.status}`;
    return { ok: false, status: response.status, error };
  }
  return { ok: true, value: map(payload) };
}

const identity = <T>(payload: unknown): T => payload as T;

export const getCurrent = (f: Fetch = fetch) =>
  request(f, `${BASE}/current`, {}, identity<CurrentSession>);

export const listSessions = (f: Fetch = fetch) =>
  request(f, BASE, {}, (payload) => (payload as { sessions: SessionSummary[] }).sessions);

export const getSession = (id: string, f: Fetch = fetch) =>
  request(f, `${BASE}/${id}`, {}, identity<SessionDetail>);

export const resumeSession = (id: string, f: Fetch = fetch) =>
  request(f, `${BASE}/${id}/resume`, { method: 'POST' }, identity<SessionDetail>);

export const startNewSession = (f: Fetch = fetch) =>
  request(f, `${BASE}/new`, { method: 'POST' }, identity<CurrentSession>);

export const saveSandbox = (
  id: string,
  text: string,
  f: Fetch = fetch,
  init: { readonly keepalive?: boolean } = {},
) =>
  request(
    f,
    `${BASE}/${id}/sandbox`,
    { method: 'PUT', jsonBody: text, ...(init.keepalive ? { keepalive: true } : {}) },
    identity<SessionSummary>,
  );

export const renameSession = (id: string, label: string, f: Fetch = fetch) =>
  request(
    f,
    `${BASE}/${id}`,
    { method: 'PATCH', jsonBody: JSON.stringify({ label }) },
    identity<SessionSummary>,
  );

export const deleteSession = (id: string, f: Fetch = fetch) =>
  request(f, `${BASE}/${id}`, { method: 'DELETE' }, () => null);
