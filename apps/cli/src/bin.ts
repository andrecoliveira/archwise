#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { inspectWorkspace } from './inventory.js';
import { buildArchitectureGraph } from './graph.js';
import { parseCli } from './index.js';

const metadata: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (
  typeof metadata !== 'object' ||
  metadata === null ||
  !('version' in metadata) ||
  typeof metadata.version !== 'string'
) {
  throw new Error('Invalid CLI package metadata');
}

const command = parseCli(process.argv.slice(2), metadata.version);
if (command.kind === 'output') {
  process.stdout.write(command.result.stdout);
  process.stderr.write(command.result.stderr);
  process.exitCode = command.result.exitCode;
} else {
  try {
    const result = await inspectWorkspace(command.path);
    if (command.graph) {
      process.stdout.write(`${JSON.stringify(buildArchitectureGraph(result), null, 2)}\n`);
    } else if (command.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`Archwise — local inventory (${result.manifests.length} manifests)\n`);
      for (const item of result.manifests) {
        process.stdout.write(
          `- ${item.path}: ${item.name} [${item.framework ?? 'unknown framework'}]\n`,
        );
      }
      for (const warning of result.diagnostics) process.stderr.write(`Warning: ${warning}\n`);
      process.stdout.write('Run with --graph for graph JSON. Browser Studio is not yet integrated.\n');
    }
  } catch (error) {
    process.stderr.write(
      `Unable to inspect workspace: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
    );
    process.exitCode = 1;
  }
}
