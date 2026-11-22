#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { resolveDataDir, StoreUnavailableError } from '@archwise/storage';
import { filesystemInventory } from '@archwise/discovery';
import type { InventoryProgress } from '@archwise/application';
import { buildArchitectureGraph } from './graph.js';
import {
  formatInventorySummary,
  portableInventory,
  rootErrorMessage,
  runScan,
  scanRecord,
} from './inventory-output.js';
import { parseCli } from './index.js';
import { startLocalGraphServer } from './local-server.js';
import {
  applyResume,
  formatSessionList,
  prepareStore,
  storeUnavailableMessage,
} from './store-runtime.js';

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

/** Best-effort browser launch without interpreting URLs via a shell. */
function openBrowser(url: string): void {
  const executable =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'explorer.exe'
        : 'xdg-open';
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
  const dataDir = resolveDataDir(process.env, process.platform, homedir());
  try {
    const home = homedir();
    const knownHomes = [home, await realpath(home).catch(() => home)];
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    process.once('SIGINT', cancel);
    const progress = process.stderr.isTTY
      ? (progress: InventoryProgress) =>
          process.stderr.write(`\rScanning… ${progress.listedEntries} entries`)
      : undefined;
    let outcome;
    try {
      outcome = await runScan(filesystemInventory, {
        roots: [{ path: command.path }],
        knownHomes,
        signal: controller.signal,
        ...(progress ? { onProgress: progress } : {}),
      });
    } finally {
      process.off('SIGINT', cancel);
      if (progress) process.stderr.write('\r\x1b[K');
    }
    if (outcome.kind === 'cancelled') {
      process.stderr.write('Scan cancelled.\n');
      process.exit(130);
    }
    const result = outcome.result;
    const record = scanRecord(result, startedAt, new Date().toISOString());
    const graph = buildArchitectureGraph(result);
    const prepareRuntime = async (enabled: boolean) => {
      const runtime = await prepareStore({
        enabled,
        dataDir,
        rootPath: result.roots[0]!,
        scan: result,
        scanRecord: record,
        graph,
      });
      for (const notice of runtime.notices) process.stderr.write(`${notice}\n`);
      return runtime;
    };
    if (command.sessions) {
      const runtime = await prepareRuntime(true);
      if (runtime.kind === 'ready') {
        process.stdout.write(formatSessionList(runtime.service.list(), runtime.service.lastScan()));
        runtime.store.close();
      } else {
        process.exitCode = 1;
      }
    } else if (command.serve) {
      const runtime = await prepareRuntime(command.store);
      const resumeError = command.resume === null ? null : applyResume(runtime, command.resume);
      if (resumeError !== null) {
        process.stderr.write(`${resumeError}\n`);
        if (runtime.kind === 'ready') runtime.store.close();
        process.exitCode = 2;
      } else {
        const webDistPath = resolve(fileURLToPath(new URL('../../web/dist/', import.meta.url)));
        // CLI/API mode works before the browser bundle is built; serve assets if available.
        let assets: string | undefined;
        try {
          const { stat } = await import('node:fs/promises');
          if ((await stat(resolve(webDistPath, 'index.html'))).isFile()) assets = webDistPath;
        } catch {
          process.stderr.write('Browser assets are not built; serving JSON API only.\n');
        }
        const server = await startLocalGraphServer(graph, {
          ...(assets ? { webDistPath: assets } : {}),
          sessions: runtime.kind === 'ready' ? runtime.service : null,
        });
        process.stdout.write(`Archwise API listening at ${server.address}\n`);
        process.stdout.write(`Local session URL: ${server.bootstrapUrl}\n`);
        process.stdout.write(
          runtime.kind === 'ready'
            ? 'Local session store ready (outside the project). List saved sessions with --sessions.\n'
            : 'Local session store disabled for this run.\n',
        );
        process.stdout.write('Press Ctrl+C to stop.\n');
        if (command.open && assets) openBrowser(server.bootstrapUrl);
      }
    } else if (command.graph) {
      process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
    } else if (command.json) {
      const portable = portableInventory(result);
      process.stdout.write(`${JSON.stringify(portable, null, 2)}\n`);
    } else {
      process.stdout.write(formatInventorySummary(result));
      for (const warning of result.diagnostics) process.stderr.write(`Warning: ${warning}\n`);
      process.stdout.write(
        'Run with --graph for graph JSON, --serve to open the local Studio, or --sessions to list saved sessions.\n',
      );
    }
  } catch (error) {
    const rootError = rootErrorMessage(error, command.path);
    if (rootError !== null) {
      process.stderr.write(`${rootError}\n`);
      process.exitCode = 2;
    } else if (error instanceof StoreUnavailableError) {
      process.stderr.write(`${storeUnavailableMessage(error.reason, dataDir)}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(
        `Unable to inspect workspace: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
      );
      process.exitCode = 1;
    }
  }
}
