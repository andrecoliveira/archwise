import { expect, test } from 'vitest';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalGraphServer } from '../src/local-server.js';
import { buildExcerptIndex } from '../src/excerpts.js';
import { repository } from './inventory-fixture.js';
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
  scannedAt: '2026-11-23T00:00:00.000Z',
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

async function excerptServer() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'archwise-server-')));
  const text = '{\n  "name": "example"\n}\n';
  await writeFile(join(root, 'package.json'), text);
  const index = buildExcerptIndex(graph, {
    version: 2,
    roots: [root],
    repositories: [repository({ id: 'repo-root', label: 'repo', path: '', nested: false })],
    manifests: [
      {
        repositoryId: 'repo-root',
        rootId: 'repo-root',
        path: 'package.json',
        name: 'example',
        framework: null,
        dependencies: [],
        runtimeDependencies: [],
        devDependencies: [],
        workspaces: null,
        sha256: createHash('sha256').update(text).digest('hex'),
      },
    ],
    files: [],
    listedEntries: 0,
    bytesRead: 0,
    skipped: {},
    truncated: null,
    diagnostics: [],
    durationMs: 0,
  });
  const server = await startLocalGraphServer(graph, {
    excerpts: { index, bytesPerFile: 1_048_576 },
  });
  const bootstrap = await fetch(server.bootstrapUrl, { redirect: 'manual' });
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
  return {
    server,
    cookie,
    dispose: async () => {
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('excerpt route requires the session, sets no-store and refuses query strings', async () => {
  const { server, cookie, dispose } = await excerptServer();
  try {
    const served = (await (
      await fetch(`${server.address}/api/v1/graph`, { headers: { cookie } })
    ).json()) as ArchitectureGraph;
    const id = served.nodes[0]!.evidence[0]!.excerptId!;
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    const url = `${server.address}/api/v1/evidence/excerpt/${id}`;
    expect((await fetch(url)).status).toBe(401);
    const ok = await fetch(url, { headers: { cookie } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.json()).toEqual({
      status: 'ok',
      path: 'package.json',
      start: 1,
      end: 3,
      lines: ['{', '  "name": "example"', '}'],
    });
    expect((await fetch(`${url}?x=1`, { headers: { cookie } })).status).toBe(400);
    const unknown = await fetch(`${server.address}/api/v1/evidence/excerpt/${'0'.repeat(64)}`, {
      headers: { cookie },
    });
    expect(unknown.status).toBe(404);
    const malformed = await fetch(`${server.address}/api/v1/evidence/excerpt/../graph`, {
      headers: { cookie },
    });
    expect(malformed.status).not.toBe(200);
  } finally {
    await dispose();
  }
});

test('served graph carries excerpt ids; the stored graph does not', async () => {
  const { server, cookie, dispose } = await excerptServer();
  try {
    const served = (await (
      await fetch(`${server.address}/api/v1/graph`, { headers: { cookie } })
    ).json()) as ArchitectureGraph;
    expect(served.nodes[0]!.evidence[0]!.excerptId).toBeDefined();
    expect('excerptId' in graph.nodes[0]!.evidence[0]!).toBe(false);
  } finally {
    await dispose();
  }
});
