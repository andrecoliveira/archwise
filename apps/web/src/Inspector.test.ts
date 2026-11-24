import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Inspector from './Inspector.svelte';
import { discoveredEdge, discoveredNode, graphOf } from './graph-fixtures.js';
import type { GraphEvidence, GraphNode } from './graph-types.js';
import { excerptIdsFrom } from './excerpt-client.js';
import { systemGraph } from './system-view.js';

afterEach(cleanup);

const ID = 'b'.repeat(64);
const at = (
  path: string,
  kind: string,
  lines: GraphEvidence['lines'] = null,
  extra: Partial<GraphEvidence> = {},
): GraphEvidence => ({ path, kind, lines, analyzer: 'test', ...extra });

const api = discoveredNode('api', {
  type: 'service',
  label: '@shop/api',
  technology: 'fastify',
  reasons: ['compose-build:api', 'framework-dependency:fastify'],
  aliases: ['api'],
  evidence: [
    at('apps/api/package.json', 'package-manifest'),
    at('apps/api/package.json', 'framework-dependency'),
    at('compose.yaml', 'compose-build', { start: 2, end: 6 }, { excerptId: ID }),
  ],
  properties: [
    {
      name: 'ports',
      value: '8080:80',
      evidence: at('compose.yaml', 'compose-property', { start: 4, end: 5 }),
    },
  ],
});
const pg = discoveredNode('pg', {
  type: 'datastore',
  label: 'PostgreSQL',
  technology: 'PostgreSQL',
  confidence: 'inferred',
  reasons: ['client-library'],
  evidence: [at('apps/api/package.json', 'client-library')],
});
const web = discoveredNode('web', { type: 'frontend', label: '@shop/web', technology: 'next' });
const toPg = discoveredEdge('api', 'pg', {
  confidence: 'inferred',
  reasons: ['client-library:pg'],
  evidence: [at('apps/api/package.json', 'client-library')],
});
const fromWeb = discoveredEdge('web', 'api');
const graph = graphOf([api, pg, web], [toPg, fromWeb]);

function props(overrides: Record<string, unknown> = {}) {
  return {
    node: api as GraphNode | null,
    view: graph,
    full: graph,
    excerptIds: new Map<string, string>(),
    historical: false,
    tab: 'details' as const,
    onSelect: vi.fn(),
    fetcher: vi.fn(),
    ...overrides,
  };
}

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

test('header is text only', () => {
  const { container } = render(Inspector, { props: props() });
  const header = container.querySelector('.inspector-header')!;
  expect(within(header as HTMLElement).getByRole('heading', { name: '@shop/api' })).toBeTruthy();
  expect(header.textContent).toContain('Service');
  expect(header.textContent).toContain('fastify · apps/api');
  expect(header.textContent).toContain(
    'Service · fastify · runs in compose.yaml · uses 1 · used by 1',
  );
  expect(header.querySelector('svg')).toBeNull();
  expect(header.querySelector('.kind-swatch')?.getAttribute('style')).toContain(
    'var(--kind-service)',
  );
});

test('observed band reads "Observed because:" with sentences', () => {
  const { container } = render(Inspector, { props: props() });
  const band = container.querySelector('.confidence-band')!;
  expect(band.textContent).toContain('Observed because:');
  expect(band.textContent).toContain('Compose builds it as service api');
  expect(band.textContent).toContain('Compose builds it as service api · compose.yaml · lines 2–6');
  expect(band.textContent).toContain('depends on fastify, a server framework');
  expect([...band.querySelectorAll('code')].map((c) => c.textContent)).toEqual([
    'compose-build:api',
    'framework-dependency:fastify',
  ]);
  expect(band.textContent).not.toContain('No file states this directly');
});

test('inferred band shows the warning', () => {
  const { container } = render(Inspector, { props: props({ node: pg }) });
  const band = container.querySelector('.confidence-band')!;
  expect(band.textContent).toContain('Inferred because:');
  expect(band.textContent).toContain('a package depends on its client library');
  expect(band.textContent).toContain('No file states this directly. Check before relying on it.');
  expect(band.classList.contains('inferred')).toBe(true);
});

test('details shows properties with their source, and aliases', () => {
  const { container } = render(Inspector, { props: props() });
  const panel = container.querySelector('[role="tabpanel"]')!;
  expect(panel.textContent).toContain('ports');
  expect(panel.textContent).toContain('8080:80');
  expect(panel.textContent).toContain('compose.yaml:4');
  expect(panel.textContent).toContain('Also called api · compose.yaml:2');
  const source = panel.querySelector('.property-source summary')!;
  expect(source.textContent).toBe('compose.yaml:4');
  expect(source.getAttribute('title')).toBe('compose.yaml · lines 4–5 · compose-property');
  expect(panel.querySelector('.property-source')!.textContent).toContain(
    'compose.yaml · lines 4–5 · compose-property',
  );
});

test('relations groups Uses and Used by and activating a row selects', async () => {
  const onSelect = vi.fn();
  const { container } = render(Inspector, { props: props({ tab: 'relations', onSelect }) });
  const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
  expect(within(panel).getByRole('heading', { name: 'Uses' })).toBeTruthy();
  expect(within(panel).getByRole('heading', { name: 'Used by' })).toBeTruthy();
  expect(panel.textContent).toContain('depends on');
  expect(panel.textContent).toContain('Inferred because:');
  expect(panel.textContent).toContain('depends on pg, a PostgreSQL client library');
  await fireEvent.click(within(panel).getByRole('button', { name: /PostgreSQL/ }));
  expect(onSelect).toHaveBeenCalledWith('pg');
  await fireEvent.click(within(panel).getByRole('button', { name: /@shop\/web/ }));
  expect(onSelect).toHaveBeenCalledWith('web');
});

test('indirect relation row lists its steps and "Also through"', () => {
  const a = discoveredNode('a', { label: 'a' });
  const b = discoveredNode('b', { label: 'b' });
  const full = graphOf(
    [api, a, b, pg],
    [
      discoveredEdge('api', 'a'),
      discoveredEdge('a', 'pg'),
      discoveredEdge('api', 'b'),
      discoveredEdge('b', 'pg', { confidence: 'inferred', reasons: ['client-library:pg'] }),
    ],
  );
  const view = systemGraph(full);
  const { container } = render(Inspector, { props: props({ tab: 'relations', view, full }) });
  const panel = container.querySelector('[role="tabpanel"]')!;
  expect(panel.textContent).toContain('through a');
  expect(panel.textContent).toContain('@shop/api depends on a · Observed');
  expect(panel.textContent).toContain('a depends on PostgreSQL · Observed');
  expect(panel.textContent).toContain('Also through b');
});

test('evidence groups by file with copy and show lines', async () => {
  const fetcher = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          status: 'ok',
          path: 'compose.yaml',
          start: 2,
          end: 3,
          lines: ['  api:', '<b>x</b>'],
        }),
        { status: 200 },
      ),
    ),
  );
  const { container } = render(Inspector, { props: props({ tab: 'evidence', fetcher }) });
  const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
  expect(
    within(panel)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent),
  ).toEqual(['apps/api/package.json', 'compose.yaml']);
  expect(panel.textContent).toContain('compose-build');
  expect(panel.textContent).toContain('lines 2–6');
  await fireEvent.click(within(panel).getByRole('button', { name: 'Copy compose.yaml:2' }));
  expect(writeText).toHaveBeenCalledWith('compose.yaml:2');
  await fireEvent.click(
    within(panel).getByRole('button', { name: 'Show lines of compose.yaml:2' }),
  );
  await vi.waitFor(() => expect(panel.querySelector('pre')).not.toBeNull());
  expect(fetcher).toHaveBeenCalledWith(`/api/v1/evidence/excerpt/${ID}`, {
    credentials: 'same-origin',
  });
  expect(panel.querySelector('pre')!.textContent).toContain('<b>x</b>');
  expect(panel.querySelector('pre b')).toBeNull();
});

test("historical evidence maps to the latest scan's excerpt id or says it is unavailable", async () => {
  const stored = discoveredNode('api', {
    label: '@shop/api',
    evidence: [at('compose.yaml', 'compose-build', { start: 2, end: 6 }), at('old.yaml', 'x')],
  });
  const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'changed' }))));
  const excerptIds = excerptIdsFrom(
    graphOf([
      discoveredNode('api', {
        evidence: [at('compose.yaml', 'compose-build', { start: 2, end: 6 }, { excerptId: ID })],
      }),
      discoveredNode('other', {
        evidence: [at('old.yaml', 'x', null, { excerptId: 'e'.repeat(64) })],
      }),
    ]),
  );
  const { container } = render(Inspector, {
    props: props({ node: stored, tab: 'evidence', historical: true, excerptIds, fetcher }),
  });
  const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
  expect(panel.textContent).toContain('Not available: this evidence is from an earlier scan.');
  expect(within(panel).queryByRole('button', { name: 'Show lines of old.yaml' })).toBeNull();
  await fireEvent.click(
    within(panel).getByRole('button', { name: 'Show lines of compose.yaml:2' }),
  );
  await vi.waitFor(() => expect(panel.textContent).toContain('This file changed since the scan.'));
  expect(fetcher).toHaveBeenCalledWith(`/api/v1/evidence/excerpt/${ID}`, expect.anything());
});

test('the active tab survives a selection change', async () => {
  const { container, rerender } = render(Inspector, { props: props({ tab: 'relations' }) });
  await rerender({ node: pg });
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Relations',
  );
});

test('tabs switch with clicks and arrow keys', async () => {
  render(Inspector, { props: props() });
  const details = screen.getByRole('tab', { name: 'Details' });
  await fireEvent.keyDown(details, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Relations' }).getAttribute('aria-selected')).toBe('true');
  await fireEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
  expect(screen.getByRole('tab', { name: 'Evidence' }).getAttribute('aria-selected')).toBe('true');
});

test('empty state copy', () => {
  render(Inspector, { props: props({ node: null }) });
  expect(
    screen.getByText(
      'Select a component on the canvas or in the list to see what it is, what it relates to, and why.',
    ),
  ).toBeTruthy();
});
