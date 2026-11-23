import { expect, test } from 'vitest';
import { request } from 'node:http';
import { startLocalGraphServer } from '../src/local-server.js';
import type { ArchitectureGraph } from '../src/graph.js';
import type { ScanSummary } from '../src/inventory-output.js';

const graph: ArchitectureGraph = {
  version: 2,
  gaps: [],
  nodes: [
    {
      id: 'package:package.json',
      type: 'module',
      label: 'example',
      technology: null,
      confidence: 'observed',
      reasons: ['manifest-declared'],
      outsideWorkspace: false,
      aliases: [],
      origin: 'discovered',
      evidence: [
        { path: 'package.json', kind: 'package-manifest', lines: null, analyzer: 'node-manifest' },
      ],
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
    const invalidHostStatus = await new Promise<number>((resolve, reject) => {
      const req = request(
        `${server.address}/api/v1/graph`,
        {
          headers: { host: 'localhost:4321' },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(invalidHostStatus).toBe(403);
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

const summary: ScanSummary = {
  version: 1,
  listedEntries: 120,
  skipped: { 'ignored-builtin': 3 },
  truncated: null,
  repositories: [
    {
      id: 'repo-root',
      label: 'shop',
      nested: false,
      reached: true,
      listedEntries: 120,
      manifests: 1,
      skipped: { 'ignored-builtin': 3 },
    },
  ],
};

async function signIn(server: { bootstrapUrl: string }): Promise<string> {
  const bootstrap = await fetch(server.bootstrapUrl, { redirect: 'manual' });
  return bootstrap.headers.get('set-cookie')!.split(';')[0]!;
}

test('the scan summary is served behind the session like the graph', async () => {
  const server = await startLocalGraphServer(graph, { scan: summary });
  try {
    expect((await fetch(`${server.address}/api/v1/scan`)).status).toBe(401);
    const cookie = await signIn(server);
    const response = await fetch(`${server.address}/api/v1/scan`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
  } finally {
    await server.close();
  }
});

test('without a scan summary the route is not found', async () => {
  const server = await startLocalGraphServer(graph);
  try {
    const cookie = await signIn(server);
    const response = await fetch(`${server.address}/api/v1/scan`, { headers: { cookie } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  } finally {
    await server.close();
  }
});

test('the CSP allows only self-hosted fonts', async () => {
  const server = await startLocalGraphServer(graph);
  try {
    const cookie = await signIn(server);
    const response = await fetch(`${server.address}/api/v1/health`, { headers: { cookie } });
    await response.json();
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("default-src 'none'");
  } finally {
    await server.close();
  }
});
