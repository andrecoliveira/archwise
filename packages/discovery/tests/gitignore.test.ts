import { describe, expect, test } from 'vitest';
import { isIgnored, parseGitignore } from '../src/gitignore.js';

describe('single patterns', () => {
  test.each([
    ['dist', 'a/dist', true, true],
    ['/dist', 'a/dist', true, false],
    ['/dist', 'dist', true, true],
    ['build/', 'build', false, false],
    ['build/', 'build', true, true],
    ['*.log', 'x/y.log', false, true],
    ['docs/*.md', 'docs/a/b.md', false, false],
    ['docs/*.md', 'docs/b.md', false, true],
    ['docs/**/*.md', 'docs/a/b.md', false, true],
    ['docs/**/*.md', 'docs/b.md', false, true],
    ['**/tmp', 'a/b/tmp', true, true],
    ['a/**', 'a/b/c', false, true],
    ['a/**', 'a', true, false],
    ['[ab].txt', 'b.txt', false, true],
    ['[!ab].txt', 'b.txt', false, false],
    ['[!ab].txt', 'c.txt', false, true],
    ['\\#x', '#x', false, true],
    ['# c', '# c', false, false],
    ['\\!x', '!x', false, true],
    ['a?c', 'abc', false, true],
    ['a?c', 'a/c', false, false],
    ['trail   ', 'trail', false, true],
    ['', 'anything', false, false],
  ] as const)('%j against %s (dir %s) → %s', (pattern, path, isDirectory, ignored) => {
    expect(isIgnored([parseGitignore(pattern, '')], path, isDirectory)).toBe(ignored);
  });
});

test('the last matching rule wins, so negation re-includes', () => {
  const stack = [parseGitignore('*.json\n!keep.json\n', '')];
  expect(isIgnored(stack, 'x.json', false)).toBe(true);
  expect(isIgnored(stack, 'keep.json', false)).toBe(false);
});

test('a nested .gitignore applies only below its directory and can re-include', () => {
  const stack = [parseGitignore('*.json', ''), parseGitignore('!pkg.json', 'sub')];
  expect(isIgnored(stack, 'sub/pkg.json', false)).toBe(false);
  expect(isIgnored(stack, 'other/pkg.json', false)).toBe(true);
  const scoped = [parseGitignore('/x', 'sub')];
  expect(isIgnored(scoped, 'sub/x', false)).toBe(true);
  expect(isIgnored(scoped, 'other/x', false)).toBe(false);
  expect(isIgnored(scoped, 'x', false)).toBe(false);
});

test('CRLF files and comments parse like LF files', () => {
  const stack = [parseGitignore('# comment\r\n*.tmp\r\n\r\n', '')];
  expect(isIgnored(stack, 'a.tmp', false)).toBe(true);
  expect(isIgnored(stack, 'a.txt', false)).toBe(false);
});

test('adversarial patterns stay linear', () => {
  const started = performance.now();
  const stack = [parseGitignore(`${'*'.repeat(10_000)}a`, '')];
  isIgnored(stack, 'b'.repeat(10_000), false);
  const doubled = [parseGitignore(`${'**/'.repeat(2_000)}z`, '')];
  isIgnored(doubled, `${'d/'.repeat(2_000)}y`, false);
  expect(performance.now() - started).toBeLessThan(50);
});

describe('review fixes', () => {
  test('alternating wildcards and literals match in bounded time', () => {
    const name = 'a'.repeat(60);
    const deep = Array.from({ length: 40 }, () => 'a').join('/');
    const started = performance.now();
    expect(isIgnored([parseGitignore('*a*a*a*a*a*a*a*ab', '')], name, false)).toBe(false);
    expect(isIgnored([parseGitignore(`${'*a'.repeat(8)}b`, '')], name, false)).toBe(false);
    expect(isIgnored([parseGitignore(`${'**/a/'.repeat(10)}b`, '')], deep, false)).toBe(false);
    expect(isIgnored([parseGitignore(`${'*a'.repeat(8)}`, '')], name, false)).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test('an invalid range matches nothing without discarding the other rules', () => {
    const stack = [parseGitignore('[z-a]\n*.log\n', '')];
    expect(isIgnored(stack, 'z', false)).toBe(false);
    expect(isIgnored(stack, 'x.log', false)).toBe(true);
  });

  test('a UTF-8 byte order mark is ignored', () => {
    expect(isIgnored([parseGitignore('﻿dist\n', '')], 'dist', true)).toBe(true);
  });

  test('a ** segment in the middle matches zero or more directories', () => {
    const stack = [parseGitignore('a/**/b', '')];
    expect(isIgnored(stack, 'a/b', false)).toBe(true);
    expect(isIgnored(stack, 'a/x/y/b', false)).toBe(true);
    expect(isIgnored(stack, 'a/x/y/c', false)).toBe(false);
  });
});
