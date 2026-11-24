import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';

/*
 * Every colour comes from styles/tokens.css, including colours TypeScript hands to the canvas. A literal anywhere else would bypass the themes
 * and could give one colour two meanings, so this guard fails on any of them.
 */
const SRC = join(import.meta.dirname, '..');
const TOKENS = join(SRC, 'styles', 'tokens.css');
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![-\w])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple)(?![-\w])/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(css|svelte)$/.test(entry.name) || /(?<!\.test)\.ts$/.test(entry.name) ? [path] : [];
  });
}

/** The parts of a file that hold styling: whole CSS files, Svelte style blocks and style attributes. */
function styledLines(path: string): { line: number; text: string }[] {
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');
  if (path.endsWith('.css')) return lines.map((text, i) => ({ line: i + 1, text }));
  // TypeScript modules may hand colours to the canvas: check their string literals.
  if (path.endsWith('.ts'))
    return lines.flatMap((text, i) =>
      [...text.matchAll(/'([^'\n]*)'|`([^`\n]*)`|"([^"\n]*)"/g)].map((m) => ({
        line: i + 1,
        text: m[1] ?? m[2] ?? m[3] ?? '',
      })),
    );
  const out: { line: number; text: string }[] = [];
  let inStyle = false;
  let inScript = false;
  lines.forEach((text, i) => {
    if (/<style[\s>]/i.test(text)) inStyle = true;
    if (/<script[\s>]/i.test(text)) inScript = true;
    if (inStyle) out.push({ line: i + 1, text });
    else if (inScript)
      for (const m of text.matchAll(/'([^'\n]*)'|`([^`\n]*)`|"([^"\n]*)"/g))
        out.push({ line: i + 1, text: m[1] ?? m[2] ?? m[3] ?? '' });
    else
      // SVG paint attributes in markup are colours too.
      for (const m of text.matchAll(/(?:fill|stroke|stop-color)="([^"]*)"/g))
        out.push({ line: i + 1, text: m[1]! });
    if (/<\/script[^>]*>/i.test(text)) inScript = false;
    else
      for (const match of text.matchAll(/style(?::[\w-]+)?="([^"]*)"/g))
        out.push({ line: i + 1, text: match[1]! });
    if (/<\/style[^>]*>/i.test(text)) inStyle = false;
  });
  return out;
}

test('no stylesheet outside tokens.css uses a literal colour', () => {
  const offenders = files(SRC)
    .filter((path) => path !== TOKENS)
    .flatMap((path) =>
      styledLines(path)
        .filter(({ text }) => LITERAL.test(text.replace(/\/\*.*?\*\//g, '')))
        .map(({ line, text }) => `${relative(SRC, path)}:${line}: ${text.trim()}`),
    );
  expect(offenders).toEqual([]);
});
