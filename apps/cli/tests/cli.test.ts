import { expect, test } from 'vitest';
import { parseCli, runCli } from '../src/index.js';

test('defaults to read-only inspection of current directory', () => {
  expect(parseCli([])).toEqual({
    kind: 'inspect',
    roots: [{ path: '.', flag: '--path' }],
    workspace: null,
    json: false,
    graph: false,
    serve: false,
    open: true,
    sessions: false,
    store: true,
    resume: null,
  });
});

test('accepts a workspace path and graph output', () => {
  expect(parseCli(['--path', './fixtures', '--graph'])).toEqual({
    kind: 'inspect',
    roots: [{ path: './fixtures', flag: '--path' }],
    workspace: null,
    json: false,
    graph: true,
    serve: false,
    open: true,
    sessions: false,
    store: true,
    resume: null,
  });
});

test('prints supplied executable version', () => {
  expect(runCli(['--version'], '0.2.0-dev.1').stdout).toBe('0.2.0-dev.1\n');
});

test('prints help and rejects unsupported or contradictory options', () => {
  expect(runCli(['--help']).stdout).toContain('--graph');
  expect(runCli(['--repo']).exitCode).toBe(2);
  expect(runCli(['--json', '--graph']).exitCode).toBe(2);
  expect(runCli(['--path']).exitCode).toBe(2);
  expect(runCli(['--no-open']).exitCode).toBe(2);
  expect(runCli(['--serve', '--graph']).exitCode).toBe(2);
  expect(parseCli(['--serve', '--no-open'])).toEqual({
    kind: 'inspect',
    roots: [{ path: '.', flag: '--path' }],
    workspace: null,
    json: false,
    graph: false,
    serve: true,
    open: false,
    sessions: false,
    store: true,
    resume: null,
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

test('--resume requires --serve, the store, and latest or a session id', () => {
  expect(parseCli(['--serve', '--resume', 'latest'])).toMatchObject({
    serve: true,
    resume: 'latest',
  });
  const id = `ses-${'a'.repeat(24)}`;
  expect(parseCli(['--serve', '--resume', id])).toMatchObject({ resume: id });
  expect(parseCli(['--serve'])).toMatchObject({ resume: null });
  expect(runCli(['--resume', 'latest']).exitCode).toBe(2);
  expect(runCli(['--serve', '--resume', 'ses-bad']).exitCode).toBe(2);
  expect(runCli(['--serve', '--resume']).exitCode).toBe(2);
  expect(runCli(['--serve', '--resume', 'latest', '--no-store']).exitCode).toBe(2);
  expect(runCli(['--help']).stdout).toContain('--resume');
});

test('--repo repeats and mixes with --path', () => {
  expect(parseCli(['--repo', 'a', '--repo', 'b'])).toMatchObject({
    roots: [
      { path: 'a', flag: '--repo' },
      { path: 'b', flag: '--repo' },
    ],
    workspace: null,
  });
  expect(parseCli(['--path', 'a', '--repo', 'b', '--json'])).toMatchObject({
    roots: [
      { path: 'a', flag: '--path' },
      { path: 'b', flag: '--repo' },
    ],
    json: true,
  });
});

test('--workspace loads a file and cannot be combined with roots', () => {
  expect(parseCli(['--workspace', 'w.json', '--serve'])).toMatchObject({
    roots: [],
    workspace: 'w.json',
    serve: true,
  });
  for (const args of [
    ['--workspace', 'w.json', '--repo', 'a'],
    ['--path', 'a', '--workspace', 'w.json'],
  ]) {
    expect(runCli(args)).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: '--workspace cannot be combined with --repo or --path.\n',
    });
  }
});

test.each([
  [['--repo'], '--repo expects a directory.\n'],
  [['--repo', '--json'], '--repo expects a directory.\n'],
  [['--path'], '--path expects a directory.\n'],
  [['--workspace'], '--workspace expects a file.\n'],
])('%j has a stable error', (args, stderr) => {
  expect(runCli(args)).toEqual({ exitCode: 2, stdout: '', stderr });
});

test('help documents --repo and --workspace', () => {
  const help = runCli(['--help']).stdout;
  expect(help).toContain('--repo DIRECTORY');
  expect(help).toContain('--workspace FILE');
});
