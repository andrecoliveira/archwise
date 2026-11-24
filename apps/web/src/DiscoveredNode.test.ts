import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { discoveredNode } from './graph-fixtures.js';
import type { GraphNode } from './graph-types.js';

// Handles need a Svelte Flow store; a stand-in keeps this a pure card test.
vi.mock('@xyflow/svelte', async () => ({
  Handle: (await import('./test-support/NoopHandle.svelte')).default,
  Position: { Left: 'left', Right: 'right' },
}));
const { default: DiscoveredNode } = await import('./DiscoveredNode.svelte');

afterEach(cleanup);

function card(node: GraphNode, selected = false): HTMLElement {
  const { container } = render(DiscoveredNode, { data: { node }, selected });
  return container.querySelector('.discovered-node') as HTMLElement;
}

test('inferred card is dashed and labelled, not recolored', () => {
  const element = card(
    discoveredNode('datastore:postgresql', {
      type: 'datastore',
      confidence: 'inferred',
      label: 'PostgreSQL',
      reasons: ['client-library'],
    }),
  );
  expect(element.dataset.confidence).toBe('inferred');
  expect(element.dataset.kind).toBe('datastore');
  expect(
    screen.getByText('Inferred because: a package depends on its client library'),
  ).toBeTruthy();
  expect(element.classList.contains('dashed')).toBe(true);
});

test('second line shows technology and folder', () => {
  card(
    discoveredNode('package:apps/api/package.json', {
      type: 'service',
      label: '@shop/api',
      technology: 'fastify',
      evidence: [
        { path: 'apps/api/package.json', kind: 'package-manifest', lines: null, analyzer: 'm' },
      ],
    }),
  );
  expect(screen.getByText('fastify · apps/api')).toBeTruthy();
});

test('marker uses the level line style', () => {
  const unknown = card({
    ...discoveredNode('k8s', { label: 'cluster' }),
    type: 'kubernetes',
  } as unknown as GraphNode);
  expect(unknown.classList.contains('dotted')).toBe(true);
  expect(card(discoveredNode('a')).classList.contains('solid')).toBe(true);
});

test('observed card has no inferred label', () => {
  const element = card(
    discoveredNode('package:apps/api/package.json', { type: 'service', label: '@shop/api' }),
  );
  expect(element.dataset.confidence).toBe('observed');
  expect(screen.queryByText(/Inferred because/)).toBeNull();
});

test('the card names its kind', () => {
  card(
    discoveredNode('queue:bullmq', {
      type: 'queue',
      label: 'BullMQ',
      technology: 'BullMQ',
      confidence: 'inferred',
    }),
  );
  expect(screen.getByText('Queue')).toBeTruthy();
});

test('selected card is marked', () => {
  const element = card(discoveredNode('package:apps/api/package.json', { type: 'service' }), true);
  expect(element.classList.contains('chosen')).toBe(true);
});

test('long names keep their full text for people and assistive tech', () => {
  const label = '@shop/a-very-long-package-name-that-keeps-going-and-going-for-eighty-characters';
  card(discoveredNode('package:packages/db/package.json', { label }));
  expect(screen.getByText(label).getAttribute('title')).toBe(label);
});
