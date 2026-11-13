import { expect, test } from 'vitest';
import { startLocalGraphServer } from '../src/local-server.js';
import type { ArchitectureGraph } from '../src/graph.js';

const graph: ArchitectureGraph = {
  version: 1,
  nodes: [
    {
      id: 'package:package.json',
      type: 'package',
      label: 'example',
      framework: null,
      origin: 'discovered',
      evidence: [{ path: 'package.json', kind: 'package-manifest' }],
    },
  ],
  edges: [],
  inspectedEntries: 1,
  diagnostics: [],
};

test('requires a one-time session bootstrap before exposing graph data', async () => {
  const server = await startLocalGraphServer(graph);
  try {
    const unauthorized = await fetch(`${server.address}/api/v1/graph`);
    expect(unauthorized.status).toBe(401);

    const bootstrap = await fetch(server.bootstrapUrl, { redirect: 'manual' });
    expect(bootstrap.status).toBe(303);
    expect(bootstrap.headers.get('location')).toBe('/');
    const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toMatch(/^archwise_session=/);

    const replay = await fetch(server.bootstrapUrl, { redirect: 'manual' });
    expect(replay.status).toBe(403);

    const authorized = await fetch(`${server.address}/api/v1/graph`, {
      headers: { cookie: cookie! },
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual(graph);
  } finally {
    await server.close();
  }
});

test('rejects cross-origin, cross-site, invalid-host and mutating requests', async () => {
  const server = await startLocalGraphServer(graph);
  try {
    expect(
      (
        await fetch(`${server.address}/api/v1/graph`, {
          headers: { origin: 'https://example.com' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${server.address}/api/v1/graph`, {
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${server.address}/api/v1/graph`, {
          headers: { host: 'localhost:4321' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${server.address}/api/v1/graph`, {
          method: 'POST',
        })
      ).status,
    ).toBe(405);
  } finally {
    await server.close();
  }
});

test('rejects missing compiled browser assets with actionable error', async () => {
  await expect(
    startLocalGraphServer(graph, { webDistPath: '/archwise/not-built' }),
  ).rejects.toThrow('Build @archwise/web');
});
