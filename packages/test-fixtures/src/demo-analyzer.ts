import type { Analyzer, AnalyzerInput, AnalyzerOutput } from '@archwise/application';

/**
 * A demonstration analyzer written outside the core packages. It imports only the public
 * contract types from `@archwise/application` (a boundary rule enforces it) and reports each
 * `TODO.md` as an inferred external system.
 */
export const demoAnalyzer: Analyzer = Object.freeze({
  descriptor: Object.freeze({
    id: 'demo-todo',
    version: '0.1.0',
    inputs: Object.freeze({ fileNames: ['TODO.md'], extensions: [] }),
    budget: Object.freeze({ timeMs: 1000, maxFiles: 10 }),
  }),
  analyze(input: AnalyzerInput): AnalyzerOutput {
    return {
      status: 'complete',
      facts: input.files.map((file) => ({
        type: 'resource' as const,
        kind: 'external-system' as const,
        technology: 'todo',
        label: 'TODO list',
        confidence: 'inferred' as const,
        compose: null,
        evidence: [{ path: file.path, lines: null, ruleId: 'todo-file' }],
      })),
      gaps: [],
    };
  },
});
