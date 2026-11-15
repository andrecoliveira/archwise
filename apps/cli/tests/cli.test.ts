import { expect, test } from 'vitest';
import { parseCli, runCli } from '../src/index.js';

test('defaults to read-only inspection of current directory', () => {
  expect(parseCli([])).toEqual({
    kind: 'inspect',
    path: '.',
    json: false,
    graph: false,
    serve: false,
    open: true,
    sessions: false,
    store: true,
  });
});

test('accepts a workspace path and graph output', () => {
  expect(parseCli(['--path', './fixtures', '--graph'])).toEqual({
    kind: 'inspect',
    path: './fixtures',
    json: false,
    graph: true,
    serve: false,
    open: true,
    sessions: false,
    store: true,
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
  expect(runCli(['--no-open']).exitCode).toBe(2);
  expect(runCli(['--serve', '--graph']).exitCode).toBe(2);
  expect(parseCli(['--serve', '--no-open'])).toEqual({
    kind: 'inspect',
    path: '.',
    json: false,
    graph: false,
    serve: true,
    open: false,
    sessions: false,
    store: true,
  });
});

test('lists saved sessions and controls the local store', () => {
  expect(parseCli(['--sessions'])).toMatchObject({ kind: 'inspect', sessions: true, serve: false });
  expect(parseCli(['--serve', '--no-store'])).toMatchObject({ serve: true, store: false });
  expect(runCli(['--sessions', '--serve']).exitCode).toBe(2);
  expect(runCli(['--sessions', '--graph']).exitCode).toBe(2);
  expect(runCli(['--no-store']).exitCode).toBe(2);
  expect(runCli(['--help']).stdout).toContain('--sessions');
  expect(runCli(['--help']).stdout).toContain('--no-store');
});

test('help does not claim the Studio already saves sessions', () => {
  const help = runCli(['--help']).stdout;
  expect(help).not.toContain('saves\nSandbox sessions');
  expect(help).not.toMatch(/saves Sandbox sessions/);
  expect(help).toContain('local store');
});
