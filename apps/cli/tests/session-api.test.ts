import { createMemoryStore, SessionService, type IdGenerator } from '@archwise/application';
import { afterEach, expect, test } from 'vitest';
import type { ArchitectureGraph } from '../src/graph.js';
import { startLocalGraphServer, type LocalServer } from '../src/local-server.js';
import { buildGraphRevision } from '../src/revision.js';

const graph: ArchitectureGraph = {
  version: 1,
  nodes: [],
  edges: [],
  diagnostics: [],
  inspectedEntries: 0,
};

const hexIds = (): IdGenerator => {
  let n = 0;
  return { next: (prefix) => `${prefix}-${(++n).toString(16).padStart(24, '0')}` };
};

function service(): SessionService {
  let second = 0;
  const opened = SessionService.open(
    {
      store: createMemoryStore(),
      clock: { now: () => new Date(Date.UTC(2026, 10, 16, 0, 0, second++)).toISOString() },
      ids: hexIds(),
      digest: { sha256Hex: (text) => text },
    },
    {
      rootPath: '/secret/absolute/root',
      view: JSON.stringify(graph),
      viewIdentity: JSON.stringify(graph),
      build: (ids) => buildGraphRevision(graph, 'root', ids),
    },
  );
  if (!opened.ok) throw new Error(opened.error);
  return opened.value;
}

const sandbox = (components = 1) =>
  JSON.stringify({
    format: 'archwise-sandbox',
    version: 1,
    projectSignature: 'sig',
    nodes: Array.from({ length: components }, (_, i) => ({ id: `sandbox-${i}` })),
    connections: [],
    draft: { savedA: null, savedB: null },
  });

let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(sessions: SessionService | null = service()) {
  server = await startLocalGraphServer(graph, { sessions });
  const bootstrap = await fetch(server.bootstrapUrl, { redirect: 'manual' });
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
  const call = (path: string, init: RequestInit & { json?: boolean } = {}) =>
    fetch(`${server!.address}${path}`, {
      ...init,
      headers: {
        cookie,
        ...(init.method && init.method !== 'GET' ? { origin: server!.address } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  return { call, address: server.address };
}

test('session routes require the session capability', async () => {
  server = await startLocalGraphServer(graph, { sessions: service() });
  for (const path of ['/api/v1/sessions/current', '/api/v1/sessions']) {
    expect((await fetch(`${server.address}${path}`)).status).toBe(401);
  }
});

test('a reserved session is persisted on first save and then listed', async () => {
  const { call } = await start();
  const current = (await (await call('/api/v1/sessions/current')).json()) as {
    id: string;
    persisted: boolean;
    storeEnabled: boolean;
  };
  expect(current).toMatchObject({ persisted: false, storeEnabled: true });
  expect((await call(`/api/v1/sessions/${current.id}`)).status).toBe(404);

  const saved = await call(`/api/v1/sessions/${current.id}/sandbox`, {
    method: 'PUT',
    body: sandbox(2),
  });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ id: current.id, componentCount: 2 });

  const list = (await (await call('/api/v1/sessions')).json()) as { sessions: { id: string }[] };
  expect(list.sessions.map((s) => s.id)).toEqual([current.id]);

  const detail = await call(`/api/v1/sessions/${current.id}`);
  expect(detail.status).toBe(200);
  const body = (await detail.json()) as { sandbox: string; view: unknown; baseIsCurrent: boolean };
  expect(body.sandbox).toBe(sandbox(2));
  expect(body.view).toEqual(graph);
  expect(body.baseIsCurrent).toBe(true);
});

test('rename, resume and delete', async () => {
  const { call } = await start();
  const { id } = (await (await call('/api/v1/sessions/current')).json()) as { id: string };
  await call(`/api/v1/sessions/${id}/sandbox`, { method: 'PUT', body: sandbox() });

  const renamed = await call(`/api/v1/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ label: 'Cache experiment' }),
  });
  expect(renamed.status).toBe(200);
  expect(await renamed.json()).toMatchObject({ label: 'Cache experiment' });

  const badLabel = await call(`/api/v1/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ label: '' }),
  });
  expect(badLabel.status).toBe(422);
  expect(await badLabel.json()).toEqual({ error: 'invalid-label' });

  const resumed = await call(`/api/v1/sessions/${id}/resume`, { method: 'POST' });
  expect(resumed.status).toBe(200);

  expect((await call(`/api/v1/sessions/${id}`, { method: 'DELETE' })).status).toBe(204);
  expect((await call(`/api/v1/sessions/${id}`)).status).toBe(404);
  const current = (await (await call('/api/v1/sessions/current')).json()) as { id: string };
  expect(current.id).not.toBe(id);
});

test('invalid sandbox payloads are rejected with stable codes', async () => {
  const { call } = await start();
  const { id } = (await (await call('/api/v1/sessions/current')).json()) as { id: string };
  const invalid = await call(`/api/v1/sessions/${id}/sandbox`, { method: 'PUT', body: '{}' });
  expect(invalid.status).toBe(422);
  expect(await invalid.json()).toEqual({ error: 'invalid-sandbox' });

  const tooLarge = await call(`/api/v1/sessions/${id}/sandbox`, {
    method: 'PUT',
    body: ' '.repeat(300_001),
  });
  expect(tooLarge.status).toBe(413);
});

test('mutations require same-origin requests with JSON bodies', async () => {
  const { call, address } = await start();
  const { id } = (await (await call('/api/v1/sessions/current')).json()) as { id: string };
  const noOrigin = await call(`/api/v1/sessions/${id}/sandbox`, {
    method: 'PUT',
    body: sandbox(),
    headers: { origin: '' },
  });
  expect(noOrigin.status).toBe(403);

  const wrongType = await call(`/api/v1/sessions/${id}/sandbox`, {
    method: 'PUT',
    body: sandbox(),
    headers: { 'content-type': 'text/plain', origin: address },
  });
  expect(wrongType.status).toBe(415);
});

test.each(['/api/v1/sessions/..%2F..%2Fetc', `/api/v1/sessions/ses-${'a'.repeat(200)}`])(
  'path-like or oversized ids are 404 without echo: %s',
  async (path) => {
    const { call } = await start();
    const response = await call(path);
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).not.toContain('etc');
    expect(text).not.toContain('aaaaaaaa');
  },
);

test('responses never contain the absolute workspace root', async () => {
  const { call } = await start();
  const { id } = (await (await call('/api/v1/sessions/current')).json()) as { id: string };
  await call(`/api/v1/sessions/${id}/sandbox`, { method: 'PUT', body: sandbox() });
  for (const path of ['/api/v1/sessions/current', '/api/v1/sessions', `/api/v1/sessions/${id}`]) {
    expect(await (await call(path)).text()).not.toContain('/secret/absolute/root');
  }
});

test('without a store the API reports it is disabled', async () => {
  const { call } = await start(null);
  expect(await (await call('/api/v1/sessions/current')).json()).toEqual({
    id: null,
    persisted: false,
    storeEnabled: false,
  });
  expect((await call('/api/v1/sessions')).status).toBe(404);
});

test('non-session routes still reject mutating methods', async () => {
  const { call } = await start();
  expect((await call('/api/v1/graph', { method: 'POST' })).status).toBe(405);
});

test('POST /new reserves a fresh current session for same-origin callers', async () => {
  const { call } = await start();
  const before = (await (await call('/api/v1/sessions/current')).json()) as { id: string };
  const denied = await call('/api/v1/sessions/new', { method: 'POST', headers: { origin: '' } });
  expect(denied.status).toBe(403);
  const created = await call('/api/v1/sessions/new', { method: 'POST' });
  expect(created.status).toBe(200);
  const body = (await created.json()) as { id: string; persisted: boolean; storeEnabled: boolean };
  expect(body).toMatchObject({ persisted: false, storeEnabled: true });
  expect(body.id).not.toBe(before.id);
});
