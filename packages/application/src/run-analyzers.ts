import { compareCodeUnits } from '@archwise/domain';
import {
  isCoverageGap,
  isFact,
  matchesInputName,
  type Analyzer,
  type Fact,
  type GapReason,
  type PackageFact,
} from './analyzer.js';

export interface AnalyzerFileCandidate {
  /** Repository-relative, '/'-separated. */
  readonly path: string;
  readonly text: string | null;
  readonly problem: 'too-large' | 'binary' | 'unreadable' | null;
}

export interface AnalysisRepositoryInput {
  readonly repository: { readonly id: string; readonly label: string };
  readonly files: readonly AnalyzerFileCandidate[];
  readonly packages: readonly PackageFact[];
}

export interface AnalysisFact {
  readonly analyzerId: string;
  readonly analyzerVersion: string;
  readonly repositoryId: string;
  readonly fact: Fact;
}

export interface AnalysisCoverage {
  readonly repositoryId: string;
  readonly analyzerId: string;
  readonly analyzerVersion: string;
  readonly status: 'complete' | 'partial' | 'failed';
}

export interface AnalysisGap {
  readonly repositoryId: string;
  readonly analyzerId: string;
  readonly path: string;
  readonly reason: GapReason;
}

export interface AnalysisResult {
  readonly facts: readonly AnalysisFact[];
  readonly coverage: readonly AnalysisCoverage[];
  readonly gaps: readonly AnalysisGap[];
  readonly failures: readonly { readonly repositoryId: string; readonly analyzerId: string }[];
}

export const EMPTY_ANALYSIS: AnalysisResult = Object.freeze({
  facts: [],
  coverage: [],
  gaps: [],
  failures: [],
});

export interface RunAnalyzersRequest {
  readonly analyzers: readonly Analyzer[];
  readonly repositories: readonly AnalysisRepositoryInput[];
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

function wants(analyzer: Analyzer, path: string): boolean {
  const name = baseName(path);
  const { fileNames, extensions } = analyzer.descriptor.inputs;
  return (
    fileNames.some((pattern) => matchesInputName(name, pattern)) ||
    extensions.some((extension) => name.endsWith(extension))
  );
}

/** The union of every analyzer's declared inputs, sorted and unique. */
export function analyzerInputs(analyzers: readonly Analyzer[]): {
  fileNames: string[];
  extensions: string[];
} {
  const unique = (values: string[]): string[] => [...new Set(values)].sort(compareCodeUnits);
  return {
    fileNames: unique(analyzers.flatMap((a) => [...a.descriptor.inputs.fileNames])),
    extensions: unique(analyzers.flatMap((a) => [...a.descriptor.inputs.extensions])),
  };
}

function isOutput(value: unknown): value is {
  status: 'complete' | 'partial';
  facts: unknown[];
  gaps: unknown[];
} {
  if (value === null || typeof value !== 'object') return false;
  const output = value as Record<string, unknown>;
  return (
    (output.status === 'complete' || output.status === 'partial') &&
    Array.isArray(output.facts) &&
    Array.isArray(output.gaps)
  );
}

/**
 * Runs each analyzer once per repository, in analyzer-ID order. A failure (exception, invalid
 * output, or a return after the deadline) discards only that analyzer's findings for that
 * repository; everything else is kept. An abort rethrows.
 */
export function runAnalyzers(request: RunAnalyzersRequest): AnalysisResult {
  const now = request.now ?? Date.now;
  const signal = request.signal ?? new AbortController().signal;
  const analyzers = [...request.analyzers].sort((a, b) =>
    compareCodeUnits(a.descriptor.id, b.descriptor.id),
  );
  const facts: AnalysisFact[] = [];
  const coverage: AnalysisCoverage[] = [];
  const gaps: AnalysisGap[] = [];
  const failures: { repositoryId: string; analyzerId: string }[] = [];

  for (const input of request.repositories) {
    const repositoryId = input.repository.id;
    const files = [...input.files].sort((a, b) => compareCodeUnits(a.path, b.path));
    for (const analyzer of analyzers) {
      signal.throwIfAborted();
      const { id: analyzerId, version: analyzerVersion, budget } = analyzer.descriptor;
      const own: AnalysisGap[] = [];
      const usable: { path: string; text: string }[] = [];
      let status: 'complete' | 'partial' = 'complete';
      for (const file of files.filter((candidate) => wants(analyzer, candidate.path))) {
        if (file.problem !== null || file.text === null) {
          own.push({
            repositoryId,
            analyzerId,
            path: file.path,
            reason: file.problem ?? 'unreadable',
          });
        } else if (usable.length >= budget.maxFiles) {
          own.push({ repositoryId, analyzerId, path: file.path, reason: 'budget' });
          status = 'partial';
        } else {
          usable.push({ path: file.path, text: file.text });
        }
      }
      const deadline = now() + budget.timeMs;
      let output: unknown;
      let failed = false;
      try {
        output = analyzer.analyze({
          repository: input.repository,
          files: usable,
          packages: input.packages,
          deadline,
          signal,
          now,
        });
      } catch {
        failed = true;
      }
      signal.throwIfAborted();
      if (
        failed ||
        now() > deadline ||
        !isOutput(output) ||
        !output.facts.every(isFact) ||
        !output.gaps.every(isCoverageGap)
      ) {
        coverage.push({ repositoryId, analyzerId, analyzerVersion, status: 'failed' });
        failures.push({ repositoryId, analyzerId });
        continue;
      }
      if (output.status === 'partial') status = 'partial';
      coverage.push({ repositoryId, analyzerId, analyzerVersion, status });
      for (const fact of output.facts) {
        facts.push({ analyzerId, analyzerVersion, repositoryId, fact });
      }
      gaps.push(...own);
      for (const gap of output.gaps as { path: string; reason: GapReason }[]) {
        gaps.push({ repositoryId, analyzerId, path: gap.path, reason: gap.reason });
      }
    }
  }
  const byOwner = (
    a: { repositoryId: string; analyzerId: string },
    b: { repositoryId: string; analyzerId: string },
  ): number =>
    compareCodeUnits(a.repositoryId, b.repositoryId) ||
    compareCodeUnits(a.analyzerId, b.analyzerId);
  return {
    facts: facts.sort(byOwner),
    coverage: coverage.sort(byOwner),
    gaps: gaps.sort(byOwner),
    failures: failures.sort(byOwner),
  };
}
