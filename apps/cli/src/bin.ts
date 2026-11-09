#!/usr/bin/env node
import { runCli } from './index.js';
import { readFileSync } from 'node:fs';
const metadata: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
if (
  typeof metadata !== 'object' ||
  metadata === null ||
  !('version' in metadata) ||
  typeof metadata.version !== 'string'
) {
  throw new Error('Invalid CLI package metadata');
}
const result = runCli(process.argv.slice(2), metadata.version);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
