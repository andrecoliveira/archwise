import { expect, test } from 'vitest';
import { MAX_WORKSPACE_REPOSITORIES, parseWorkspaceFile } from '../src/index.js';

const file = (extra: Record<string, unknown> = {}, repositories: unknown = [{ path: 'a' }]) =>
  JSON.stringify({ format: 'archwise.workspace', version: 1, repositories, ...extra });

test.each([
  ['{', 'file is not valid JSON'],
  ['[]', 'file must be a JSON object'],
  [
    JSON.stringify({ version: 1, repositories: [{ path: 'a' }] }),
    'format must be "archwise.workspace"',
  ],
  [file({ version: 2 }), 'version must be 1'],
  [file({}, []), 'repositories must list 1 to 64 entries'],
  [
    file(
      {},
      Array.from({ length: MAX_WORKSPACE_REPOSITORIES + 1 }, () => ({ path: 'a' })),
    ),
    'repositories must list 1 to 64 entries',
  ],
  [file({}, 'a'), 'repositories must list 1 to 64 entries'],
  [file({}, [{ path: 1 }]), 'repositories[0].path must be a non-empty string'],
  [file({}, [{ path: '' }]), 'repositories[0].path must be a non-empty string'],
  [file({}, ['a']), 'repositories[0] must be a JSON object'],
  [file({}, [{ path: 'a', label: 'x'.repeat(300) }]), 'repositories[0].label is not a valid label'],
  [file({}, [{ path: 'a', label: '/Users/alex/x' }]), 'repositories[0].label is not a valid label'],
  [file({}, [{ path: 'a', label: 7 }]), 'repositories[0].label is not a valid label'],
  [file({}, [{ path: 'a', extra: 1 }]), 'repositories[0].extra is not allowed'],
  [file({ extra: 1 }), 'extra is not allowed'],
])('%s → %s', (input, problem) => {
  expect(parseWorkspaceFile(input)).toEqual({ ok: false, problem });
});

test('a valid file keeps entry order and omits missing labels', () => {
  const result = parseWorkspaceFile(
    file({}, [{ path: '../web', label: 'Web' }, { path: '/abs/api' }]),
  );
  expect(result).toEqual({
    ok: true,
    value: {
      format: 'archwise.workspace',
      version: 1,
      repositories: [{ path: '../web', label: 'Web' }, { path: '/abs/api' }],
    },
  });
});
