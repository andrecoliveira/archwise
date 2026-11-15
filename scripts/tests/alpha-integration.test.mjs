import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { inspectWorkspace } from '../../apps/cli/dist/inventory.js';
import { buildArchitectureGraph } from '../../apps/cli/dist/graph.js';
import { startLocalGraphServer } from '../../apps/cli/dist/local-server.js';

test('CLI discovery to authenticated browser Studio serves a traced graph without changing source', async (t) => {
  const webRoot = resolve('apps/web/dist');
  try {
    await stat(join(webRoot, 'index.html'));
  } catch {
    t.skip('Build @archwise/web before running the packaged integration test');
    return;
  }

  const root = await mkdtemp(join(tmpdir(), 'archwise-alpha-e2e-'));
  const webManifest = JSON.stringify({
    name: '@sample/web',
    dependencies: { '@sample/api': 'workspace:*', next: '15.0.0' },
  });
  const apiManifest = JSON.stringify({
    name: '@sample/api',
    dependencies: { fastify: '5.0.0' },
  });
  let server;
  try {
    const webPath = join(root, 'apps/web/package.json');
    const apiPath = join(root, 'apps/api/package.json');
    await mkdir(dirname(webPath), { recursive: true });
    await mkdir(dirname(apiPath), { recursive: true });
    await writeFile(webPath, webManifest);
    await writeFile(apiPath, apiManifest);

    const inventory = await inspectWorkspace(root);
    const graph = buildArchitectureGraph(inventory);
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0]?.source, 'package:apps/web/package.json');

    server = await startLocalGraphServer(graph, { webDistPath: webRoot });
    const unauthorized = await fetch(`${server.address}/api/v1/graph`);
    assert.equal(unauthorized.status, 401);

    const bootstrap = await fetch(server.bootstrapUrl, { redirect: 'manual' });
    assert.equal(bootstrap.status, 303);
    const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie ?? '', /^archwise_session=/);

    const response = await fetch(`${server.address}/api/v1/graph`, {
      headers: { cookie },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), graph);

    const htmlResponse = await fetch(server.address, { headers: { cookie } });
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /Archwise/);
    const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(assetPath, 'Vite-generated Studio JavaScript asset should be referenced');
    const assetResponse = await fetch(new URL(assetPath, server.address), {
      headers: { cookie },
    });
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') ?? '', /javascript/);

    assert.equal(await readFile(webPath, 'utf8'), webManifest);
    assert.equal(await readFile(apiPath, 'utf8'), apiManifest);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
