import type {
  Analyzer,
  AnalyzerInput,
  AnalyzerOutput,
  CoverageGap,
  Fact,
} from '@archwise/application';
import { compareCodeUnits } from '@archwise/domain';
import { basenamePosix } from './paths.js';
import { matchesWorkspaceGlob } from './workspace-globs.js';
import { parseYaml } from './yaml.js';

const UNSUPPORTED = new Set(['nx.json', 'project.json', 'lerna.json']);

/**
 * Workspace membership from the repository root's `package.json` `workspaces` and
 * `pnpm-workspace.yaml`. Packages outside the globs (examples, fixtures) are flagged so the
 * System view can hide them. Nx and Lerna files are reported as unsupported.
 */
export const nodeWorkspace: Analyzer = Object.freeze({
  descriptor: Object.freeze({
    id: 'node-workspace',
    version: '1.0.0',
    inputs: Object.freeze({
      fileNames: ['lerna.json', 'nx.json', 'pnpm-workspace.yaml', 'project.json'],
      extensions: [],
    }),
    budget: Object.freeze({ timeMs: 2000, maxFiles: 2000 }),
  }),
  analyze(input: AnalyzerInput): AnalyzerOutput {
    const gaps: CoverageGap[] = [];
    const patterns: string[] = [
      ...(input.packages.find((pkg) => pkg.directory === '')?.workspaces ?? []),
    ];
    for (const file of input.files) {
      if (UNSUPPORTED.has(basenamePosix(file.path))) {
        gaps.push({ path: file.path, reason: 'unsupported' });
        continue;
      }
      if (file.path !== 'pnpm-workspace.yaml') continue;
      const parsed = parseYaml(file.text);
      if (!parsed.ok) {
        gaps.push({ path: file.path, reason: 'invalid-syntax' });
        continue;
      }
      const value = parsed.value as { packages?: unknown } | null;
      if (value !== null && typeof value === 'object' && Array.isArray(value.packages)) {
        patterns.push(...value.packages.filter((item): item is string => typeof item === 'string'));
      }
    }
    const facts: Fact[] = [];
    if (patterns.length > 0) {
      for (const pkg of input.packages) {
        if (pkg.directory === '' || matchesWorkspaceGlob(pkg.directory, patterns)) continue;
        facts.push({
          type: 'outside-workspace',
          package: pkg.path,
          evidence: [{ path: pkg.path, lines: null, ruleId: 'outside-workspace' }],
        });
      }
    }
    gaps.sort((a, b) => compareCodeUnits(a.path, b.path));
    return { status: 'complete', facts, gaps };
  },
});
