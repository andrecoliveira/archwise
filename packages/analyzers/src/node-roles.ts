import type {
  Analyzer,
  AnalyzerInput,
  AnalyzerOutput,
  Fact,
  FactEvidence,
} from '@archwise/application';
import { compareCodeUnits } from '@archwise/domain';
import { LIBRARY_CATALOG, ROLE_CATALOG } from './catalog.js';

const evidence = (path: string, ruleId: string): FactEvidence[] => [{ path, lines: null, ruleId }];

/**
 * Package roles from framework dependencies, and infrastructure inferred from client libraries
 * in runtime dependencies. Everything it emits is `inferred`: a dependency is not a deployment.
 */
export const nodeRoles: Analyzer = Object.freeze({
  descriptor: Object.freeze({
    id: 'node-roles',
    version: '1.1.0',
    inputs: Object.freeze({ fileNames: [], extensions: [] }),
    budget: Object.freeze({ timeMs: 2000, maxFiles: 0 }),
  }),
  analyze(input: AnalyzerInput): AnalyzerOutput {
    const facts: Fact[] = [];
    const resources = new Map<string, Fact>();
    for (const pkg of input.packages) {
      const all = new Set([...pkg.dependencies, ...pkg.devDependencies]);
      const frontend = ROLE_CATALOG.find((e) => e.role === 'frontend' && all.has(e.dependency));
      const service = ROLE_CATALOG.find((e) => e.role === 'service' && all.has(e.dependency));
      const chosen = frontend ?? service;
      if (chosen) {
        const signals = [frontend, service].filter((e) => e !== undefined).map((e) => e.dependency);
        facts.push({
          type: 'package-role',
          package: pkg.path,
          role: chosen.role,
          technology: chosen.dependency,
          confidence: 'inferred',
          reason: `framework-dependency:${signals.join(',')}`,
          evidence: evidence(pkg.path, 'framework-dependency'),
        });
      }
      const runtime = new Set(pkg.dependencies);
      const used = LIBRARY_CATALOG.filter((e) => runtime.has(e.dependency)).sort((a, b) =>
        compareCodeUnits(a.dependency, b.dependency),
      );
      for (const entry of used) {
        const key = `${entry.kind}:${entry.technology}`;
        if (!resources.has(key)) {
          resources.set(key, {
            type: 'resource',
            kind: entry.kind,
            technology: entry.technology,
            label: entry.label,
            confidence: 'inferred',
            compose: null,
            ...(entry.category ? { category: entry.category } : {}),
            evidence: evidence(pkg.path, 'client-library'),
          });
        }
        facts.push({
          type: 'relation',
          kind: 'depends-on',
          from: { package: pkg.path },
          to: { resource: { kind: entry.kind, technology: entry.technology } },
          confidence: 'inferred',
          reason: `client-library:${entry.dependency}`,
          evidence: evidence(pkg.path, 'client-library'),
        });
      }
    }
    return { status: 'complete', facts: [...resources.values(), ...facts], gaps: [] };
  },
});
