import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const entry = fileURLToPath(new URL('../../apps/cli/dist/bin.js', import.meta.url));
test('built CLI exposes help and version with correct exit codes', () => {
  const help = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /not implemented/);
  const version = spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  const manifest = JSON.parse(
    readFileSync(new URL('../../apps/cli/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(version.stdout, `${manifest.version}\n`);
  const unsupported = spawnSync(process.execPath, [entry, '--repo', '.'], { encoding: 'utf8' });
  assert.equal(unsupported.status, 2);
  assert.equal(unsupported.stdout, '');
  assert.match(unsupported.stderr, /Unsupported/);
});
