import { expect, test } from 'vitest';
import { bindSandbox, createRevision, type GraphRevision } from '../src/index.js';
import { validRevision } from './fixtures.js';

const revision = (() => {
  const result = createRevision(validRevision());
  if (!result.ok) throw new Error('fixture must be valid');
  return result.value;
})() satisfies GraphRevision;

const reference = {
  sandboxId: 'sbx-1',
  schemaVersion: 1,
  workspaceId: 'ws-1',
  baseRevisionId: 'rev-1',
} as const;

test('binds a reference whose workspace and base match the revision', () => {
  const result = bindSandbox(reference, revision);
  expect(result).toEqual({ ok: true, value: reference });
  if (result.ok) {
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value).not.toBe(reference);
  }
});

test('rejects a reference to another workspace', () => {
  expect(bindSandbox({ ...reference, workspaceId: 'ws-2' }, revision)).toEqual({
    ok: false,
    issues: [{ code: 'workspace-mismatch', path: ['workspaceId'] }],
  });
});

test('rejects a reference to another base revision', () => {
  expect(bindSandbox({ ...reference, baseRevisionId: 'rev-0' }, revision)).toEqual({
    ok: false,
    issues: [{ code: 'base-mismatch', path: ['baseRevisionId'] }],
  });
});

test('rejects an invalid sandbox ID', () => {
  expect(bindSandbox({ ...reference, sandboxId: 'bad id' }, revision)).toEqual({
    ok: false,
    issues: [{ code: 'invalid-id', path: ['sandboxId'] }],
  });
});
