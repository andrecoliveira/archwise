import { expect, test } from 'vitest';
import {
  boxGeometry,
  cylinderGeometry,
  dotStopFraction,
  faceMatrix,
  hull,
  polygonPath,
  project,
  roundedFootprint,
} from './kit.js';

test('project maps the world axes to 30° isometric', () => {
  const [x1, y1] = project(10, 0, 0);
  expect(x1).toBeCloseTo(8.66, 2);
  expect(y1).toBeCloseTo(5, 2);
  const [x2, y2] = project(0, 10, 0);
  expect(x2).toBeCloseTo(-8.66, 2);
  expect(y2).toBeCloseTo(5, 2);
  expect(project(0, 0, 10)).toEqual([0, -10]);
});

test('hull of a square plus an inner point is the square', () => {
  expect(
    hull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
    ]),
  ).toHaveLength(4);
});

test('roundedFootprint samples every corner', () => {
  expect(roundedFootprint(0, 0, 100, 100, 10, 0)).toHaveLength(4 * 7);
});

test('polygonPath rounds to two decimals and closes', () => {
  expect(
    polygonPath([
      [0, 0],
      [1.234567, 2],
      [3, 4.5],
    ]),
  ).toBe('M0 0L1.23 2L3 4.5Z');
});

test('box geometry puts the shading split where the front corner projects', () => {
  const box = boxGeometry({ x0: -50, y0: -50, z0: 0, w: 100, d: 100, h: 40, r: 0 });
  expect(box.gradient.stop).toBeCloseTo(0.5, 2);
  expect(box.hull.startsWith('M')).toBe(true);
  expect(box.top.endsWith('Z')).toBe(true);
});

test('box gradient stop is clamped', () => {
  const box = boxGeometry({ x0: 0, y0: 0, z0: 0, w: 1000, d: 1, h: 1, r: 0 });
  expect(box.gradient.stop).toBeLessThanOrEqual(0.98);
  expect(box.gradient.stop).toBeGreaterThanOrEqual(0.02);
});

test('face matrices anchor at the face origin', () => {
  const b = { x0: 0, y0: 0, z0: 0, w: 10, d: 10, h: 5 };
  expect(faceMatrix('top', b)).toBe('matrix(0.87,0.5,-0.87,0.5,0,-5)');
  expect(faceMatrix('left', b)).toBe('matrix(0.87,0.5,0,1,-8.66,0)');
  expect(faceMatrix('right', b)).toBe('matrix(0.87,-0.5,0,1,0,5)');
});

test('cylinder ellipse axes follow the projection', () => {
  const c = cylinderGeometry({ cx: 0, cy: 0, z0: 0, r: 10, h: 20, bands: 3 });
  expect(c.rx).toBeCloseTo(12.25, 2);
  expect(c.ry).toBeCloseTo(7.07, 2);
  expect(c.bands).toHaveLength(2);
  expect(c.topCy).toBe(-20);
});

test('dotStopFraction stops before the arrowhead', () => {
  expect(dotStopFraction(200)).toEqual({ from: 0.03, to: 0.89 });
  expect(dotStopFraction(20)).toEqual({ from: 0, to: 0 });
});
