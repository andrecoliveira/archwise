import { describe, expect, test, vi } from 'vitest';
import {
  deleteSession,
  getCurrent,
  getSession,
  listSessions,
  renameSession,
  resumeSession,
  saveSandbox,
  startNewSession,
} from './session-client.js';

const respond = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );

const id = `ses-${'a'.repeat(24)}`;

describe('requests', () => {
  test.each([
    ['getCurrent', () => getCurrent, [], 'GET', '/api/v1/sessions/current'],
    ['listSessions', () => listSessions, [], 'GET', '/api/v1/sessions'],
    ['getSession', () => getSession, [id], 'GET', `/api/v1/sessions/${id}`],
    ['resumeSession', () => resumeSession, [id], 'POST', `/api/v1/sessions/${id}/resume`],
    ['startNewSession', () => startNewSession, [], 'POST', '/api/v1/sessions/new'],
    ['deleteSession', () => deleteSession, [id], 'DELETE', `/api/v1/sessions/${id}`],
  ] as const)('%s uses %s %s', async (_name, pick, args, method, path) => {
    const f = respond(
      method === 'DELETE' ? 204 : 200,
      method === 'DELETE' ? undefined : { sessions: [] },
    );
    await (pick() as (...a: unknown[]) => Promise<unknown>)(...args, f);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(path);
    expect(init?.method ?? 'GET').toBe(method);
    expect(init?.credentials).toBe('same-origin');
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
  });

  test('saveSandbox sends the raw document as JSON and supports keepalive', async () => {
    const f = respond(200, { id });
    await saveSandbox(id, '{"format":"archwise-sandbox"}', f, { keepalive: true });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`/api/v1/sessions/${id}/sandbox`);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"format":"archwise-sandbox"}');
    expect(init?.keepalive).toBe(true);
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  test('renameSession sends a JSON label', async () => {
    const f = respond(200, { id, label: 'New' });
    await renameSession(id, 'New', f);
    const [, init] = f.mock.calls[0]!;
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"label":"New"}');
  });
});

describe('responses', () => {
  test('parses successful JSON', async () => {
    expect(await getCurrent(respond(200, { id, persisted: false, storeEnabled: true }))).toEqual({
      ok: true,
      value: { id, persisted: false, storeEnabled: true },
    });
    expect(await listSessions(respond(200, { sessions: [{ id }] }))).toEqual({
      ok: true,
      value: [{ id }],
    });
  });

  test('delete returns null on 204', async () => {
    expect(await deleteSession(id, respond(204))).toEqual({ ok: true, value: null });
  });

  test('non-2xx responses become typed failures', async () => {
    expect(await getSession(id, respond(404, { error: 'not-found' }))).toEqual({
      ok: false,
      status: 404,
      error: 'not-found',
    });
    expect(await saveSandbox(id, '{}', respond(500))).toEqual({
      ok: false,
      status: 500,
      error: 'HTTP 500',
    });
  });

  test('network errors never throw', async () => {
    const f = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await getCurrent(f)).toEqual({ ok: false, status: 0, error: 'network' });
  });
});
