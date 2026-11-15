import { expect, test } from 'vitest';
import {
  CATALOG_GROUPS,
  COMPONENT_CATALOG,
  findCatalogComponent,
  searchCatalog,
} from './component-catalog.js';

test('catalog has useful entry, compute and storage components', () => {
  expect(CATALOG_GROUPS).toEqual(['Entry & traffic', 'Compute', 'Data & messaging']);
  expect(COMPONENT_CATALOG.map((item) => item.name)).toEqual([
    'Client',
    'Load Balancer',
    'App Server',
    'Worker',
    'Cache',
    'SQL Database',
    'Message Queue',
  ]);
  expect(COMPONENT_CATALOG.every((item) => CATALOG_GROUPS.includes(item.group))).toBe(true);
});

test('quick-add presets map to supported deterministic simulation kinds', () => {
  expect(findCatalogComponent('load-balancer')?.kind).toBe('service');
  expect(findCatalogComponent('worker')?.kind).toBe('service');
  expect(findCatalogComponent('cache')?.kind).toBe('cache');
  expect(findCatalogComponent('database')?.kind).toBe('database');
  expect(findCatalogComponent('queue')?.kind).toBe('queue');
  expect(findCatalogComponent('missing')).toBeUndefined();
});

test('catalog search is case-insensitive and works on description or category', () => {
  expect(searchCatalog('database').map((item) => item.id)).toEqual(['database']);
  expect(searchCatalog('TRAFFIC').some((item) => item.id === 'client')).toBe(true);
  expect(searchCatalog(' background ').map((item) => item.id)).toEqual(['worker']);
  expect(searchCatalog('does-not-exist')).toEqual([]);
  expect(searchCatalog('')).toHaveLength(COMPONENT_CATALOG.length);
});
