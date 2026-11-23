import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

/* Token rules that keep meanings apart and text readable (spec §4.1, §5.10, §3 AA). */
const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const studio = readFileSync(join(import.meta.dirname, '..', 'studio.css'), 'utf8');

function theme(name: 'dark' | 'light'): Record<string, string> {
  const block =
    name === 'dark'
      ? /:root,\s*:root\[data-theme='dark'\]\s*\{([^}]*)\}/
      : /:root\[data-theme='light'\]\s*\{([^}]*)\}/;
  const body = css.match(block)?.[1] ?? '';
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

for (const name of ['dark', 'light'] as const) {
  test(`${name}: warnings never reuse the selection accent`, () => {
    const tokens = theme(name);
    expect(tokens['--warn']).toBeDefined();
    expect(tokens['--warn']).not.toBe(tokens['--accent']);
  });

  test(`${name}: card text on every kind fill meets AA`, () => {
    const tokens = theme(name);
    for (const kind of ['frontend', 'service', 'module', 'datastore', 'queue', 'external', 'job']) {
      expect(
        contrast(tokens['--on-fill']!, tokens[`--kind-${kind}`]!),
        kind,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('card text is drawn at full strength, never faded below AA', () => {
  for (const rule of ['.discovered-kind', '.discovered-detail']) {
    const body = studio.match(new RegExp(`\\${rule}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(body, rule).not.toMatch(/opacity/);
  }
});
