import { expect, test } from 'vitest';
import { workspaceKey } from '../src/index.js';

test('one root is its own key', () => {
  expect(workspaceKey(['/a'])).toBe('/a');
});

test('several roots are a sorted JSON array, independent of input order', () => {
  expect(workspaceKey(['/b', '/a'])).toBe('["/a","/b"]');
  expect(workspaceKey(['/a', '/b'])).toBe(workspaceKey(['/b', '/a']));
});
