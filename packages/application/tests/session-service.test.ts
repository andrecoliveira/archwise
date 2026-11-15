import { expect, test } from 'vitest';
import {
  createMemoryStore,
  RevisionInvalidError,
  SessionService,
  type Store,
} from '../src/index.js';
import { buildRevision, fakeClock, identityDigest, sandboxDoc, sequentialIds } from './fixtures.js';

const deps = (store: Store = createMemoryStore()) => ({
  store,
  clock: fakeClock(),
  ids: sequentialIds(),
  digest: identityDigest,
});

const open = (d: ReturnType<typeof deps>, modules = 1, rootPath = '/fixture/root') => {
  const result = SessionService.open(d, {
    rootPath,
    view: '{"version":1}',
    viewIdentity: 'v1',
    build: buildRevision(modules),
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

test('an unchanged discovery reuses the latest revision', () => {
  const d = deps();
  const first = open(d);
  const second = open(d);
  expect(second.currentRevisionId).toBe(first.currentRevisionId);
});

test('a changed discovery creates a child revision', () => {
  const d = deps();
  const first = open(d, 1);
  const second = open(d, 2);
  expect(second.currentRevisionId).not.toBe(first.currentRevisionId);
  const stored = d.store.revisions.get(second.workspaceId, second.currentRevisionId);
  expect(stored?.revision.parentRevisionId).toBe(first.currentRevisionId);
});

test('sessions are persisted only after the first save', () => {
  const service = open(deps());
  const reserved = service.current();
  expect(reserved.persisted).toBe(false);
  expect(service.list()).toEqual([]);
  expect(service.get(reserved.id)).toEqual({ ok: false, error: 'not-found' });

  const saved = service.saveSandbox(reserved.id, sandboxDoc(1));
  expect(saved.ok && saved.value.label).toBe('Sandbox · 1 component');
  expect(service.current()).toEqual({ id: reserved.id, persisted: true });
  expect(service.list().map((s) => s.id)).toEqual([reserved.id]);
});

test('labels pluralize component counts', () => {
  const service = open(deps());
  const saved = service.saveSandbox(service.current().id, sandboxDoc(3, true));
  expect(saved.ok && saved.value).toMatchObject({
    label: 'Sandbox · 3 components',
    componentCount: 3,
    hasSnapshots: true,
  });
});

test('a resumed session keeps its base revision after newer discoveries', () => {
  const d = deps();
  const before = open(d, 1);
  const sessionId = before.current().id;
  before.saveSandbox(sessionId, sandboxDoc(1));

  const after = open(d, 2);
  const resumed = after.resume(sessionId);
  expect(resumed.ok && resumed.value.baseIsCurrent).toBe(false);
  expect(after.current()).toEqual({ id: sessionId, persisted: true });

  after.saveSandbox(sessionId, sandboxDoc(2));
  const stored = d.store.sessions.get(after.workspaceId, sessionId);
  expect(stored?.baseRevisionId).toBe(before.currentRevisionId);
  const detail = after.get(sessionId);
  expect(detail.ok && detail.value).toMatchObject({ componentCount: 2, baseIsCurrent: false });
});

test('resumed details carry the sandbox and the base revision view', () => {
  const service = open(deps());
  const id = service.current().id;
  service.saveSandbox(id, sandboxDoc(1));
  const detail = service.resume(id);
  expect(detail.ok && detail.value).toMatchObject({
    sandbox: sandboxDoc(1),
    view: '{"version":1}',
    baseIsCurrent: true,
  });
});

test('rename validates labels', () => {
  const service = open(deps());
  const id = service.current().id;
  service.saveSandbox(id, sandboxDoc(1));
  expect(service.rename(id, '')).toEqual({ ok: false, error: 'invalid-label' });
  expect(service.rename(id, 'AKIA' + 'ABCDEFGHIJKLMNOP')).toEqual({
    ok: false,
    error: 'invalid-label',
  });
  const renamed = service.rename(id, 'Cache experiment');
  expect(renamed.ok && renamed.value.label).toBe('Cache experiment');
});

test('invalid sandbox text is rejected and nothing is persisted', () => {
  const service = open(deps());
  expect(service.saveSandbox(service.current().id, '{}')).toEqual({
    ok: false,
    error: 'invalid-sandbox',
  });
  expect(service.list()).toEqual([]);
});

test('deleting the current session reserves a fresh one', () => {
  const service = open(deps());
  const id = service.current().id;
  service.saveSandbox(id, sandboxDoc(1));
  expect(service.delete(id)).toEqual({ ok: true, value: null });
  expect(service.current().id).not.toBe(id);
  expect(service.current().persisted).toBe(false);
  expect(service.list()).toEqual([]);
});

test.each(['get', 'resume', 'delete'] as const)('%s of an unknown id is not-found', (method) => {
  const service = open(deps());
  expect(service[method]('ses-unknown')).toEqual({ ok: false, error: 'not-found' });
});

test('saving to an unknown, non-current id is not-found', () => {
  const service = open(deps());
  expect(service.saveSandbox('ses-unknown', sandboxDoc(1))).toEqual({
    ok: false,
    error: 'not-found',
  });
  expect(service.rename('ses-unknown', 'x')).toEqual({ ok: false, error: 'not-found' });
});

test('sessions are isolated per workspace', () => {
  const d = deps();
  const a = open(d, 1, '/fixture/a');
  a.saveSandbox(a.current().id, sandboxDoc(1));
  const b = open(d, 1, '/fixture/b');
  expect(b.list()).toEqual([]);
  expect(b.get(a.current().id)).toEqual({ ok: false, error: 'not-found' });
});

test('an invalid discovered revision throws RevisionInvalidError', () => {
  const d = deps();
  expect(() =>
    SessionService.open(d, {
      rootPath: '/fixture',
      view: '{}',
      viewIdentity: '{}',
      build: (ids) => ({ ...buildRevision(1)(ids), createdAt: 'yesterday' }),
    }),
  ).toThrow(RevisionInvalidError);
});

test('a changed view with an unchanged revision records a new revision', () => {
  const d = deps();
  const openWith = (viewIdentity: string) => {
    const result = SessionService.open(d, {
      rootPath: '/fixture/root',
      view: `{"framework":"${viewIdentity}"}`,
      viewIdentity,
      build: buildRevision(1),
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const before = openWith('none');
  const same = openWith('none');
  const after = openWith('react');
  expect(same.currentRevisionId).toBe(before.currentRevisionId);
  expect(after.currentRevisionId).not.toBe(before.currentRevisionId);
  expect(d.store.revisions.get(after.workspaceId, after.currentRevisionId)?.view).toBe(
    '{"framework":"react"}',
  );
});
