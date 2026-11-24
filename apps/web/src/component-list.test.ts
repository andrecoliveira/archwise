import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import ComponentList from './ComponentList.svelte';
import { discoveredNode } from './graph-fixtures.js';

afterEach(cleanup);

const api = discoveredNode('api', {
  type: 'service',
  label: '@shop/api',
  technology: 'fastify',
  evidence: [
    { path: 'apps/api/package.json', kind: 'package-manifest', lines: null, analyzer: 'm' },
  ],
});
const pg = discoveredNode('pg', {
  type: 'datastore',
  label: 'PostgreSQL',
  technology: 'PostgreSQL',
  confidence: 'inferred',
  reasons: ['client-library'],
});

function list(onSelect = vi.fn()) {
  return render(ComponentList, { props: { nodes: [api, pg], selectedId: 'api', onSelect } });
}

test('each item shows name, second line and level marker', () => {
  const { container } = list();
  const item = screen.getByRole('button', { name: /@shop\/api/ });
  expect(item.textContent).toContain('fastify · apps/api');
  expect(item.querySelector('.level-marker.solid')).not.toBeNull();
  expect(item.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('nav[aria-label="Discovered components"]')).not.toBeNull();
});

test('inferred items show their first reason sentence', () => {
  list();
  const item = screen.getByRole('button', { name: /PostgreSQL/ });
  expect(item.textContent).toContain('Inferred because: a package depends on its client library');
  expect(item.querySelector('.level-marker.dashed')).not.toBeNull();
});

test('activating an item selects it', async () => {
  const onSelect = vi.fn();
  list(onSelect);
  await fireEvent.click(screen.getByRole('button', { name: /PostgreSQL/ }));
  expect(onSelect).toHaveBeenCalledWith('pg');
});

test('hidden libraries row lists them and offers All packages', async () => {
  const onShowAll = vi.fn();
  const libraries = ['@shop/db', '@shop/core', '@shop/ui'].map((label) =>
    discoveredNode(label, { label }),
  );
  render(ComponentList, {
    props: { nodes: [api], selectedId: null, onSelect: vi.fn(), hidden: libraries, onShowAll },
  });
  const row = screen.getByRole('button', { name: 'Libraries · 3 hidden' });
  expect(row.getAttribute('aria-expanded')).toBe('false');
  await fireEvent.click(row);
  expect(row.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('@shop/core')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Show all packages' }));
  expect(onShowAll).toHaveBeenCalled();
});

test('the inferred filter dims the other items', () => {
  const { container } = render(ComponentList, {
    props: { nodes: [api, pg], selectedId: null, onSelect: vi.fn(), filter: 'inferred-components' },
  });
  const items = [...container.querySelectorAll('.node-item')];
  expect(items.map((item) => item.classList.contains('dimmed'))).toEqual([true, false]);
});
