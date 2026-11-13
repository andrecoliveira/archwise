#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { inspectWorkspace } from './inventory.js';
import { buildArchitectureGraph } from './graph.js';
import { parseCli } from './index.js';
import { startLocalGraphServer } from './local-server.js';

const metadata: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (
  typeof metadata !== 'object' ||
  metadata === null ||
  !('version' in metadata) ||
  typeof metadata.version !== 'string'
) {
  throw new Error('Invalid CLI package metadata');
}

/** Best-effort browser launch without interpreting URLs via a shell. */
function openBrowser(url: string): void {
  const executable =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const child = spawn(executable, [url], { detached: true, stdio: 'ignore', shell: false });
  child.once('error', () => {
    process.stderr.write('Browser launch failed; open the local session URL manually.\n');
  });
  child.unref();
}

const command = parseCli(process.argv.slice(2), metadata.version);
if (command.kind === 'output') {
  process.stdout.write(command.result.stdout);
  process.stderr.write(command.result.stderr);
  process.exitCode = command.result.exitCode;
} else {
  try {
    const result = await inspectWorkspace(command.path);
    if (command.serve) {
      const webDistPath = resolve(fileURLToPath(new URL('../../web/dist/', import.meta.url)));
      // CLI/API mode works before the browser bundle is built; serve assets if available.
      let assets: string | undefined;
      try {
        const { stat } = await import('node:fs/promises');
        if ((await stat(resolve(webDistPath, 'index.html'))).isFile()) assets = webDistPath;
      } catch {
        process.stderr.write('Browser assets are not built; serving JSON API only.\n');
      }
      const server = await startLocalGraphServer(buildArchitectureGraph(result), { webDistPath: assets });
      process.stdout.write(`Archwise API listening at ${server.address}\n`);
      process.stdout.write(`Local session URL: ${server.bootstrapUrl}\n`);
      process.stdout.write('Press Ctrl+C to stop.\n');
      if (command.open && assets) openBrowser(server.bootstrapUrl);
    } else if (command.graph) {
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
