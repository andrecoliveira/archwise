import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const entry = fileURLToPath(new URL('../../apps/cli/dist/bin.js', import.meta.url));
test('built CLI exposes help and version with correct exit codes', () => {
  const help = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: archwise/);
  assert.match(help.stdout, /--graph/);
  assert.match(help.stdout, /--serve/);
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

test('--json and --graph never print the absolute root, home directories or secret shapes', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'archwise-export-')));
  const token = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  try {
    mkdirSync(join(root, 'app'));
    writeFileSync(
      join(root, 'app', 'package.json'),
      JSON.stringify({ name: '/home/alex/app', dependencies: { [`x-${token}`]: '1' } }),
    );
    for (const flag of ['--json', '--graph']) {
      const run = spawnSync(process.execPath, [entry, '--path', root, flag], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      JSON.parse(run.stdout);
      assert.ok(!run.stdout.includes(root), `${flag} printed the absolute root`);
      assert.ok(!run.stdout.includes('/home/alex'), `${flag} printed a home directory`);
      assert.ok(!run.stdout.includes(token), `${flag} printed a secret shape`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
