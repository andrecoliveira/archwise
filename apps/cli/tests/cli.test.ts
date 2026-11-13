import { expect, test } from 'vitest';
import { parseCli, runCli } from '../src/index.js';

test('defaults to read-only inspection of current directory', () => {
  expect(parseCli([])).toEqual({ kind: 'inspect', path: '.', json: false, graph: false });
});

test('accepts a workspace path and graph output', () => {
  expect(parseCli(['--path', './fixtures', '--graph'])).toEqual({
    kind: 'inspect', path: './fixtures', json: false, graph: true,
  });
});

test('prints supplied executable version', () => {
  expect(runCli(['--version'], '0.2.0-dev.1').stdout).toBe('0.2.0-dev.1\n');
});

test('prints help and rejects unsupported or contradictory options', () => {
  expect(runCli(['--help']).stdout).toContain('--graph');
  expect(runCli(['--repo', '.']).exitCode).toBe(2);
  expect(runCli(['--json', '--graph']).exitCode).toBe(2);
  expect(runCli(['--path']).exitCode).toBe(2);
});
