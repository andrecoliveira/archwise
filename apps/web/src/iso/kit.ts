/*
 * Isometric geometry for the Studio's component pieces (spec §4.3). Pure functions: world units
 * in, SVG path data out. True 30° isometric: x runs right-down, y left-down, z up.
 */

export const C = Math.cos(Math.PI / 6);
export const S = 0.5;

type Point = [number, number];

const round = (n: number): number => Math.round(n * 100) / 100;

export function project(x: number, y: number, z: number): Point {
  return [C * (x - y), S * (x + y) - z];
}

/** A rounded rectangle in the ground plane at height z, sampled every 15° per corner, projected. */
export function roundedFootprint(
  x0: number,
  y0: number,
  w: number,
  d: number,
  r: number,
  z: number,
  steps = 6,
): Point[] {
  const corners: [number, number, number][] = [
    [x0 + w - r, y0 + r, -90],
    [x0 + w - r, y0 + d - r, 0],
    [x0 + r, y0 + d - r, 90],
    [x0 + r, y0 + r, 180],
  ];
  const points: Point[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i += 1) {
      const angle = ((start + (i * 90) / steps) * Math.PI) / 180;
      points.push(project(cx + r * Math.cos(angle), cy + r * Math.sin(angle), z));
    }
  }
  return points;
}

/** Convex hull (monotone chain), counter-clockwise in screen space, without duplicates. */
export function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length > 1 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function polygonPath(points: Point[]): string {
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;
}

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

export interface BoxGeometry {
  /** Silhouette of the whole solid; filled with the side gradient. */
  readonly hull: string;
  /** The top face, drawn over the hull. */
  readonly top: string;
  /** The vertical front corner edge. */
  readonly frontEdge: string;
  /** Where the lit left side turns into the shaded right side, across the hull's width. */
  readonly gradient: { readonly x1: number; readonly x2: number; readonly stop: number };
}

export function boxGeometry(b: Box & { readonly r: number }): BoxGeometry {
  const top = roundedFootprint(b.x0, b.y0, b.w, b.d, b.r, b.z0 + b.h);
  const bottom = roundedFootprint(b.x0, b.y0, b.w, b.d, b.r, b.z0);
  const outline = hull(top.concat(bottom));
  const xs = outline.map(([x]) => x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  const front = project(b.x0 + b.w, b.y0 + b.d, 0)[0];
  const stop = Math.min(0.98, Math.max(0.02, (front - x1) / (x2 - x1 || 1)));
  const [fx, fyTop] = project(b.x0 + b.w, b.y0 + b.d, b.z0 + b.h);
  const fyBottom = project(b.x0 + b.w, b.y0 + b.d, b.z0)[1];
  return {
    hull: polygonPath(outline),
    top: polygonPath(top),
    frontEdge: `M${round(fx)} ${round(fyTop + b.r * 0.4)}V${round(fyBottom - b.r * 0.2)}`,
    gradient: { x1: round(x1), x2: round(x2), stop: round(stop) },
  };
}

export type FaceName = 'top' | 'left' | 'right';

/** SVG transform that maps a face's local (u right, v down) coordinates onto the box. */
export function faceMatrix(face: FaceName, b: Box): string {
  const values =
    face === 'top'
      ? [C, S, -C, S, ...project(b.x0, b.y0, b.z0 + b.h)]
      : face === 'left'
        ? [C, S, 0, 1, ...project(b.x0, b.y0 + b.d, b.z0 + b.h)]
        : [C, -S, 0, 1, ...project(b.x0 + b.w, b.y0 + b.d, b.z0 + b.h)];
  return `matrix(${values.map((n) => round(n) + 0).join(',')})`;
}

export interface CylinderGeometry {
  readonly body: string;
  readonly topCx: number;
  readonly topCy: number;
  readonly rx: number;
  readonly ry: number;
  /** Front-half arcs that split the body into stacked disks. */
  readonly bands: string[];
}

export function cylinderGeometry(c: {
  readonly cx: number;
  readonly cy: number;
  readonly z0: number;
  readonly r: number;
  readonly h: number;
  readonly bands: number;
}): CylinderGeometry {
  const [x, top] = project(c.cx, c.cy, c.z0 + c.h);
  const bottom = project(c.cx, c.cy, c.z0)[1];
  const rx = c.r * Math.SQRT2 * C;
  const ry = c.r * Math.SQRT2 * S;
  const arc = (y: number): string =>
    `M${round(x - rx)} ${round(y)}A${round(rx)} ${round(ry)} 0 0 0 ${round(x + rx)} ${round(y)}`;
  const bands: string[] = [];
  for (let i = 1; i < c.bands; i += 1) bands.push(arc(top + ((bottom - top) * i) / c.bands));
  return {
    body: `M${round(x - rx)} ${round(top)}V${round(bottom)}A${round(rx)} ${round(ry)} 0 0 0 ${round(x + rx)} ${round(bottom)}V${round(top)}Z`,
    topCx: round(x),
    topCy: round(top),
    rx,
    ry,
    bands,
  };
}

/**
 * The part of a relation's path the focus dot travels: it leaves the source boundary and stops
 * `head` px before the end, so it never covers the arrowhead (spec §4.4).
 */
export function dotStopFraction(length: number, head = 22, tail = 6): { from: number; to: number } {
  if (length <= head + tail) return { from: 0, to: 0 };
  // Round away from both ends (3 decimals), so rounding never moves the dot onto the arrowhead.
  const from = Math.ceil((tail / length) * 1000) / 1000;
  const to = Math.floor((1 - head / length) * 1000) / 1000;
  return { from, to };
}
