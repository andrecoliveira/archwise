import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { discoveredNode } from './graph-fixtures.js';

vi.mock('@xyflow/svelte', async () => ({
  Handle: (await import('./test-support/NoopHandle.svelte')).default,
  Position: { Left: 'left', Right: 'right' },
}));
const { default: IsoNode } = await import('./IsoNode.svelte');

afterEach(cleanup);

test('renders the piece for its kind', () => {
  const { container } = render(IsoNode, {
    data: {
      node: discoveredNode('compose:compose.yaml#db', {
        type: 'datastore',
        label: 'db',
        technology: 'PostgreSQL',
      }),
    },
  });
  expect(container.querySelector('g.iso-piece[data-piece="datastore"]')).not.toBeNull();
  expect(screen.getByText('db')).toBeTruthy();
  expect(screen.getByText('Datastore · PostgreSQL')).toBeTruthy();
});

test('second line shows technology and folder', () => {
  render(IsoNode, {
    data: {
      node: discoveredNode('package:apps/api/package.json', {
        type: 'service',
        label: '@shop/api',
        technology: 'fastify',
        evidence: [
          { path: 'apps/api/package.json', kind: 'package-manifest', lines: null, analyzer: 'm' },
        ],
      }),
    },
  });
  expect(screen.getByText('Service · fastify · apps/api')).toBeTruthy();
});

test('selected lights the plinth', () => {
  const { container } = render(IsoNode, {
    data: { node: discoveredNode('a', { type: 'service' }) },
    selected: true,
  });
  expect(container.querySelector('.selring.selected')).not.toBeNull();
});

test('inferred dashes the piece and says inferred', () => {
  const { container } = render(IsoNode, {
    data: {
      node: discoveredNode('queue:bullmq', {
        type: 'queue',
        label: 'BullMQ',
        technology: 'BullMQ',
        confidence: 'inferred',
        reasons: ['client-library'],
      }),
    },
  });
  expect(container.querySelector('g.iso-piece.inferred')).not.toBeNull();
  expect(screen.getByText('Queue · BullMQ')).toBeTruthy();
  const reason = screen.getByText('Inferred because: a package depends on its client library');
  expect(reason.getAttribute('title')).toBe(reason.textContent);
});

test('long labels truncate with a title', () => {
  const label =
    'demo-with-a-very-long-package-name-that-keeps-going-and-going-to-eighty-characters';
  render(IsoNode, {
    data: { node: discoveredNode('package:examples/demo/package.json', { label }) },
  });
  expect(screen.getByText(label).getAttribute('title')).toBe(label);
});

test('proposed nodes show the hatched plinth and the Proposed tag', () => {
  const { container } = render(IsoNode, {
    data: { proposed: { label: 'Cache', preset: 'cache', status: 'normal', utilization: 0.4 } },
  });
  expect(container.querySelector('.pl .hatched')).not.toBeNull();
  expect(container.querySelector('g.iso-piece[data-piece="cache"]')).not.toBeNull();
  expect(screen.getByText('Proposed')).toBeTruthy();
  expect(screen.getByText('Modeled use: 40%')).toBeTruthy();
});
