import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const cli = resolve('apps/cli/dist/bin.js');

async function snapshot(root) {
  const entries = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const key = relative(root, full).split('\\').join('/');
        const { mtimeMs } = await stat(full);
        entries[key] = { content: await readFile(full, 'base64'), mtimeMs };
      }
    }
  }
  await walk(root);
  return entries;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'archwise-session-fixture-'));
  const files = {
    'package.json': JSON.stringify({ name: 'demo-root', private: true }),
    'apps/web/package.json': JSON.stringify({
      name: '@demo/web',
      dependencies: { '@demo/core': '*' },
    }),
    'packages/core/package.json': JSON.stringify({ name: '@demo/core' }),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

const run = (args, env) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 20_000,
  });

/** Starts `--serve --no-open`, resolves with the bootstrap URL once printed. */
function serve(root, env, extra = []) {
  const child = spawn(process.execPath, [cli, '--serve', '--no-open', ...extra, '--path', root], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((accept, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 20_000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/Local session URL: (\S+)/);
      if (match) {
        clearTimeout(timer);
        accept({ child, bootstrapUrl: match[1] });
      }
    });
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('exit', (code) => reject(new Error(`server exited ${code}: ${output}`)));
  });
}

test('sessions persist across launches without touching the analyzed tree', async () => {
  const root = await fixture();
  const dataDir = await mkdtemp(join(tmpdir(), 'archwise-session-data-'));
  const env = { ARCHWISE_DATA_DIR: dataDir };
  let server;
  try {
    const before = await snapshot(root);
    const empty = run(['--sessions', '--path', root], env);
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /No saved sessions for this project\./);

    server = await serve(root, env);
    const origin = new URL(server.bootstrapUrl).origin;
    const bootstrap = await fetch(server.bootstrapUrl, { redirect: 'manual' });
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const current = await (
      await fetch(`${origin}/api/v1/sessions/current`, { headers: { cookie } })
    ).json();
    assert.equal(current.storeEnabled, true);
    const sandbox = JSON.stringify({
      format: 'archwise-sandbox',
      version: 1,
      projectSignature: 'sig',
      nodes: [{ id: 'sandbox-1' }, { id: 'sandbox-2' }],
      connections: [],
      draft: { savedA: {}, savedB: null },
    });
    const saved = await fetch(`${origin}/api/v1/sessions/${current.id}/sandbox`, {
      method: 'PUT',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: sandbox,
    });
    assert.equal(saved.status, 200);
    server.child.kill();
    await new Promise((accept) => server.child.once('exit', accept));
    server = undefined;

    const listed = run(['--sessions', '--path', root], env);
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /Sandbox · 2 components/);
    assert.match(listed.stdout, /A\/B/);
    assert.match(listed.stdout, new RegExp(current.id));
    assert.match(listed.stdout, /^Last scan: \d{4}-\d{2}-\d{2}T/m);
    for (const flag of ['--json', '--graph'])
      assert.equal(run([flag, '--path', root], env).status, 0);

    assert.deepEqual(await snapshot(root), before);
    assert.ok(existsSync(join(dataDir, 'archwise.db')));
  } finally {
    server?.child.kill();
    await rm(root, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('an unusable data directory stops --serve with an actionable message', async () => {
  const root = await fixture();
  const parent = await mkdtemp(join(tmpdir(), 'archwise-session-bad-'));
  const notADirectory = join(parent, 'file');
  await writeFile(notADirectory, 'x');
  try {
    const result = run(['--serve', '--no-open', '--path', root], {
      ARCHWISE_DATA_DIR: notADirectory,
    });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /ARCHWISE_DATA_DIR/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test('--resume latest fails clearly on an empty store and resumes the newest session otherwise', async () => {
  const root = await fixture();
  const dataDir = await mkdtemp(join(tmpdir(), 'archwise-session-data-'));
  const env = { ARCHWISE_DATA_DIR: dataDir };
  let server;
  try {
    const empty = run(['--serve', '--no-open', '--resume', 'latest', '--path', root], env);
    assert.equal(empty.status, 2, empty.stdout + empty.stderr);
    assert.match(empty.stderr, /Run --sessions/);

    server = await serve(root, env);
    let origin = new URL(server.bootstrapUrl).origin;
    let cookie = (await fetch(server.bootstrapUrl, { redirect: 'manual' })).headers
      .get('set-cookie')
      .split(';')[0];
    const current = await (
      await fetch(`${origin}/api/v1/sessions/current`, { headers: { cookie } })
    ).json();
    const saved = await fetch(`${origin}/api/v1/sessions/${current.id}/sandbox`, {
      method: 'PUT',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'archwise-sandbox', version: 1, nodes: [], draft: {} }),
    });
    assert.equal(saved.status, 200);
    server.child.kill();
    await new Promise((accept) => server.child.once('exit', accept));

    server = await serve(root, env, ['--resume', 'latest']);
    origin = new URL(server.bootstrapUrl).origin;
    cookie = (await fetch(server.bootstrapUrl, { redirect: 'manual' })).headers
      .get('set-cookie')
      .split(';')[0];
    const resumed = await (
      await fetch(`${origin}/api/v1/sessions/current`, { headers: { cookie } })
    ).json();
    assert.deepEqual(resumed, { id: current.id, persisted: true, storeEnabled: true });
  } finally {
    server?.child.kill();
    await rm(root, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});
