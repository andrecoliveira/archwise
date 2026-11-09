import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('../check-boundaries.mjs', import.meta.url));
async function inspect(files) {
  const root = await mkdtemp(join(tmpdir(), 'archwise-boundaries-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    return spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('allows domain internal dependencies', async () => {
  const result = await inspect({
    'packages/domain/src/index.ts': "export { value } from './value.js';",
    'packages/domain/src/value.ts': 'export const value = 1;',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
for (const specifier of ['node:fs', 'fs']) {
  test('rejects domain builtin import ' + specifier, async () => {
    const result = await inspect({
      'packages/domain/src/index.ts': `import fs from '${specifier}'; export { fs };`,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /domain-is-pure/);
  });
}
test('rejects direct application imports from adapters', async () => {
  const result = await inspect({
    'packages/application/src/index.ts': "export { value } from '../../storage/src/index.js';",
    'packages/storage/src/index.ts': 'export const value = 1;',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /application-inward-only/);
});
test('rejects cross-package private source imports', async () => {
  const result = await inspect({
    'apps/cli/src/index.ts': "export { value } from '../../../packages/domain/src/index.js';",
    'packages/domain/src/index.ts': 'export const value = 1;',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /no-private-cross-package/);
});
test('rejects circular imports', async () => {
  const result = await inspect({
    'packages/domain/src/index.ts': "export { value } from './value.js';",
    'packages/domain/src/value.ts': "export { value } from './index.js';",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /no-circular/);
});
test('rejects unresolved imports', async () => {
  const result = await inspect({ 'apps/cli/src/index.ts': "import 'uninstalled-private-sdk';" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /no-unresolved/);
});
test('rejects Node APIs in browser source', async () => {
  const result = await inspect({ 'apps/web/src/index.ts': "import 'node:fs';" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /browser-no-node/);
});

test('rejects relative imports bypassing package exports through dist', async () => {
  const result = await inspect({
    'apps/cli/src/index.ts': "export { value } from '../../../packages/domain/dist/internal.js';",
    'packages/domain/src/index.ts': 'export const value = 1;',
    'packages/domain/dist/internal.js': 'export const value = 1;',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /no-relative-cross-package/);
});

test('rejects undeclared installed dependencies', async () => {
  const result = await inspect({
    'apps/cli/package.json': '{"name":"@archwise/cli","type":"module"}',
    'apps/cli/src/index.ts': "import 'unexpected-sdk';",
    'node_modules/unexpected-sdk/package.json': '{"name":"unexpected-sdk","main":"index.js"}',
    'node_modules/unexpected-sdk/index.js': 'module.exports = {};',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /no-undeclared/);
});
