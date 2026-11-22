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
  const unsupported = spawnSync(process.execPath, [entry, '--bogus'], { encoding: 'utf8' });
  assert.equal(unsupported.status, 2);
  assert.equal(unsupported.stdout, '');
  assert.match(unsupported.stderr, /Unsupported/);
  const missingValue = spawnSync(process.execPath, [entry, '--repo'], { encoding: 'utf8' });
  assert.equal(missingValue.status, 2);
  assert.equal(missingValue.stderr, '--repo expects a directory.\n');
});

test('--json and --graph never print the absolute root, home directories or secret shapes', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir, homedir } = await import('node:os');
  const home = homedir();
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'archwise-export-')));
  const token = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  try {
    mkdirSync(join(root, 'app'));
    writeFileSync(
      join(root, 'app', 'package.json'),
      JSON.stringify({ name: join(home, 'app'), dependencies: { [`x-${token}`]: '1' } }),
    );
    for (const flag of ['--json', '--graph']) {
      const run = spawnSync(process.execPath, [entry, '--path', root, flag], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      JSON.parse(run.stdout);
      assert.ok(!run.stdout.includes(root), `${flag} printed the absolute root`);
      // JSON escapes Windows backslashes, so compare against the escaped form.
      assert.ok(!run.stdout.includes(JSON.stringify(home).slice(1, -1)), `${flag} printed home`);
      assert.ok(!run.stdout.includes(token), `${flag} printed a secret shape`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('root errors exit with code 2 and a stable message', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'archwise-roots-'));
  try {
    const missing = join(dir, 'missing');
    const file = join(dir, 'file.txt');
    writeFileSync(file, 'x');
    const a = spawnSync(process.execPath, [entry, '--path', missing], { encoding: 'utf8' });
    assert.equal(a.status, 2);
    assert.equal(
      a.stderr,
      `Workspace root not found: ${missing}. Pass an existing directory with --path.\n`,
    );
    const b = spawnSync(process.execPath, [entry, '--path', file], { encoding: 'utf8' });
    assert.equal(b.status, 2);
    assert.match(b.stderr, /^Workspace root is not a directory: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--json is inventory version 2 with skip counts and manifest hashes', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'archwise-json-'));
  try {
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"name":"demo"}');
    const run = spawnSync(process.execPath, [entry, '--path', root, '--json'], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.version, 2);
    assert.equal(parsed.skipped['ignored-builtin'].count, 1);
    assert.match(parsed.manifests[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal(parsed.truncated, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--repo composes repositories into one graph without printing machine paths', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir, homedir } = await import('node:os');
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'archwise-multi-')));
  try {
    for (const name of ['api', 'web']) mkdirSync(join(base, name));
    writeFileSync(join(base, 'api', 'package.json'), JSON.stringify({ name: '@m/api' }));
    writeFileSync(
      join(base, 'web', 'package.json'),
      JSON.stringify({ name: '@m/web', dependencies: { '@m/api': '1' } }),
    );
    const args = ['--repo', join(base, 'api'), '--repo', join(base, 'web')];
    const json = spawnSync(process.execPath, [entry, ...args, '--json'], { encoding: 'utf8' });
    assert.equal(json.status, 0, json.stderr);
    const inventory = JSON.parse(json.stdout);
    assert.deepEqual(inventory.repositories.map((r) => r.label).sort(), ['api', 'web']);
    const graphRun = spawnSync(process.execPath, [entry, ...args, '--graph'], { encoding: 'utf8' });
    assert.equal(graphRun.status, 0, graphRun.stderr);
    const graph = JSON.parse(graphRun.stdout);
    const byLabel = new Map(graph.nodes.map((n) => [n.label, n]));
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].source, byLabel.get('@m/web').id);
    assert.equal(graph.edges[0].target, byLabel.get('@m/api').id);
    assert.equal(byLabel.get('@m/web').repository.label, 'web');
    for (const output of [json.stdout, graphRun.stdout]) {
      assert.ok(!output.includes(base), 'printed an absolute root');
      assert.ok(!output.includes(JSON.stringify(homedir()).slice(1, -1)), 'printed home');
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('--workspace errors exit with code 2 and a stable message', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'archwise-wsfile-'));
  try {
    const file = join(dir, 'w.json');
    writeFileSync(
      file,
      JSON.stringify({ format: 'archwise.workspace', version: 1, repositories: [] }),
    );
    const bad = spawnSync(process.execPath, [entry, '--workspace', file], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.equal(
      bad.stderr,
      `Workspace file is not valid: ${file}: repositories must list 1 to 64 entries.\n`,
    );
    const both = spawnSync(process.execPath, [entry, '--workspace', file, '--repo', dir], {
      encoding: 'utf8',
    });
    assert.equal(both.status, 2);
    assert.equal(both.stderr, '--workspace cannot be combined with --repo or --path.\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
