// Benchmarks the safe inventory on synthetic trees. Not part of `pnpm check`.
// Usage: pnpm build && node scripts/bench-inventory.mjs
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filesystemInventory } from '../packages/discovery/dist/index.js';

const SIZES = [
  ['small', 1_000],
  ['medium', 20_000],
  ['large', 200_000],
];
const FILES_PER_DIR = 100;
const DEPTH = 6;

async function generate(root, files) {
  let written = 0;
  for (let dir = 0; written < files; dir++) {
    const segments = Array.from({ length: DEPTH }, (_, level) => `d${(dir >> level) % 4}`);
    const path = join(root, ...segments, `pkg${dir}`);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'package.json'), JSON.stringify({ name: `pkg-${dir}` }));
    written++;
    for (let i = 1; i < FILES_PER_DIR && written < files; i++, written++) {
      await writeFile(join(path, `f${i}.ts`), 'export {};\n');
    }
  }
}

const rows = [];
for (const [label, files] of SIZES) {
  const root = await mkdtemp(join(tmpdir(), `archwise-bench-${label}-`));
  try {
    await generate(root, files);
    const started = performance.now();
    const result = await filesystemInventory.inspect({
      roots: [{ path: root }],
      knownHomes: [],
      budgets: { entries: files * 2 },
    });
    const ms = performance.now() - started;
    rows.push(
      `| ${label} | ${files.toLocaleString('en')} | ${result.listedEntries.toLocaleString('en')} | ${result.manifests.length.toLocaleString('en')} | ${Math.round(ms)} |`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
console.log('| Tree | Files | Listed entries | Manifests | Scan ms |');
console.log('|---|---|---|---|---|');
for (const row of rows) console.log(row);
console.log(`\nNode ${process.version}, ${process.platform}/${process.arch}`);
