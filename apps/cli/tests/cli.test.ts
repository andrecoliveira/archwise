import { expect, test } from 'vitest';
import { runCli } from '../src/index.js';
test('explains current scope without analyzing any repository', () => {
  const result = runCli([]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('foundation');
  expect(result.stdout).toContain('not implemented');
});
test('prints the package version supplied by the executable', () => {
  expect(runCli(['--version'], '0.2.0-dev.1').stdout).toBe('0.2.0-dev.1\n');
});
test('rejects unsupported options with a nonzero exit', () => {
  expect(runCli(['--repo', '.']).exitCode).toBe(2);
  expect(runCli(['--version', '--bad']).exitCode).toBe(2);
});
