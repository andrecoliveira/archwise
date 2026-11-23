import type {
  Analyzer,
  AnalyzerInput,
  AnalyzerOutput,
  CoverageGap,
  Fact,
  PackageFact,
} from '@archwise/application';
import { dirnamePosix } from './paths.js';

const PROVIDERS: Readonly<Record<string, string>> = Object.freeze({
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
  mongodb: 'MongoDB',
  cockroachdb: 'CockroachDB',
});

/** The package whose directory most closely encloses `directory`. */
function owner(packages: readonly PackageFact[], directory: string): PackageFact | undefined {
  return packages
    .filter(
      (pkg) =>
        pkg.directory === '' ||
        directory === pkg.directory ||
        directory.startsWith(`${pkg.directory}/`),
    )
    .sort((a, b) => b.directory.length - a.directory.length)[0];
}

/**
 * Reads only the `provider` string literal of each `datasource` block. The connection `url`
 * is never read into anything. An `env(...)` provider is reported as unsupported.
 */
export const prismaSchema: Analyzer = Object.freeze({
  descriptor: Object.freeze({
    id: 'prisma-schema',
    version: '1.0.0',
    inputs: Object.freeze({ fileNames: [], extensions: ['.prisma'] }),
    budget: Object.freeze({ timeMs: 2000, maxFiles: 500 }),
  }),
  analyze(input: AnalyzerInput): AnalyzerOutput {
    const facts: Fact[] = [];
    const gaps: CoverageGap[] = [];
    for (const file of input.files) {
      const lines = file.text.split('\n').map((line) => {
        // Strip a `//` comment without a regular expression (input is untrusted).
        const comment = line.indexOf('//');
        const text = line.endsWith('\r') ? line.slice(0, -1) : line;
        return comment === -1 ? text : text.slice(0, comment);
      });
      const found: { technology: string; line: number }[] = [];
      let inside = false;
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!;
        if (!inside && /^\s*datasource\s+\w+\s*\{/.test(line)) {
          inside = true;
          continue;
        }
        if (!inside) continue;
        if (/^\s*\}/.test(line)) {
          inside = false;
          continue;
        }
        const provider = /^\s*provider\s*=\s*"([^"]*)"\s*$/.exec(line);
        if (provider && Object.hasOwn(PROVIDERS, provider[1]!)) {
          found.push({ technology: provider[1]!, line: index + 1 });
        }
      }
      if (found.length === 0) {
        gaps.push({ path: file.path, reason: 'unsupported' });
        continue;
      }
      const pkg = owner(input.packages, dirnamePosix(file.path));
      if (!pkg) continue;
      for (const { technology, line } of found) {
        facts.push({
          type: 'datastore-technology',
          package: pkg.path,
          technology,
          label: PROVIDERS[technology]!,
          evidence: [
            { path: file.path, lines: { start: line, end: line }, ruleId: 'prisma-datasource' },
          ],
        });
      }
    }
    return { status: 'complete', facts, gaps };
  },
});
