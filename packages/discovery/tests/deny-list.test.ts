import { expect, test } from 'vitest';
import { isDeniedInput } from '../src/index.js';

test.each([
  '.env',
  'apps/api/.env.local',
  'certs/server.pem',
  'k.key',
  'id_rsa',
  'id_rsa.pub',
  '.npmrc',
  '.netrc',
  'home/.ssh/config',
  'x/.aws/credentials',
  '.gnupg/pubring.kbx',
])('denies %s', (path) => {
  expect(isDeniedInput(path)).toBe(true);
});

test.each(['compose.yaml', 'environment.ts', 'keys.ts', 'docs/.envrc.md'])('allows %s', (path) => {
  expect(isDeniedInput(path)).toBe(false);
});
