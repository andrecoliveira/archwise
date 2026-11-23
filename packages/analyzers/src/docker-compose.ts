import type {
  Analyzer,
  AnalyzerInput,
  AnalyzerOutput,
  CoverageGap,
  Fact,
  FactEvidence,
} from '@archwise/application';
import { IMAGE_CATALOG } from './catalog.js';
import { basenamePosix, dirnamePosix, joinPosix, normalizePosix } from './paths.js';
import { parseYaml } from './yaml.js';

const BASE_FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const OVERRIDE_FILES = [
  'compose.override.yaml',
  'compose.override.yml',
  'docker-compose.override.yaml',
  'docker-compose.override.yml',
];

type Mapping = Record<string, unknown>;
const isMapping = (value: unknown): value is Mapping =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The image repository name without registry host, tag, digest or `library/`, lowercased.
 * A first segment with `.`, `:`, `${` or `localhost` is a registry host.
 */
export function normalizeImage(image: string): string {
  const segments = image.split('@')[0]!.split('/');
  if (segments.length >= 2) {
    const first = segments[0]!;
    if (/[.:]/.test(first) || first.includes('${') || first === 'localhost') segments.shift();
  }
  const last = segments.length - 1;
  segments[last] = segments[last]!.split(':')[0]!;
  const name = segments.join('/').toLowerCase();
  return name.startsWith('library/') ? name.slice('library/'.length) : name;
}

const evidence = (path: string, ruleId: string): FactEvidence[] => [{ path, lines: null, ruleId }];

/** The build context directory, or null when it cannot be a package in this repository. */
function buildDirectory(build: unknown, composeDirectory: string): string | null {
  const context =
    typeof build === 'string' ? build : isMapping(build) ? (build.context ?? '.') : null;
  if (typeof context !== 'string' || context.includes('${') || context.includes('://')) return null;
  const directory = normalizePosix(joinPosix(composeDirectory, context));
  return directory === '..' || directory.startsWith('../') ? null : directory;
}

function dependencies(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return isMapping(value) ? Object.keys(value) : [];
}

/**
 * Docker Compose as data. Reads only `image`, `build` and `depends_on` of each service;
 * environment, env files, secrets and commands are never looked at. Interpolation is not
 * resolved. Override files are reported as unsupported.
 */
export const dockerCompose: Analyzer = Object.freeze({
  descriptor: Object.freeze({
    id: 'docker-compose',
    version: '1.0.0',
    inputs: Object.freeze({ fileNames: [...BASE_FILES, ...OVERRIDE_FILES].sort(), extensions: [] }),
    budget: Object.freeze({ timeMs: 3000, maxFiles: 200 }),
  }),
  analyze(input: AnalyzerInput): AnalyzerOutput {
    const facts: Fact[] = [];
    const gaps: CoverageGap[] = [];
    const packages = new Map(input.packages.map((pkg) => [pkg.directory, pkg.path]));
    for (const file of input.files) {
      if (OVERRIDE_FILES.includes(basenamePosix(file.path))) {
        gaps.push({ path: file.path, reason: 'unsupported' });
        continue;
      }
      const parsed = parseYaml(file.text);
      const document = parsed.ok ? parsed.value : null;
      const services = isMapping(document) ? document.services : undefined;
      if (!parsed.ok || !isMapping(document) || !isMapping(services)) {
        gaps.push({ path: file.path, reason: 'invalid-syntax' });
        continue;
      }
      const directory = dirnamePosix(file.path);
      let unmatched = false;
      for (const [service, definition] of Object.entries(services)) {
        if (!isMapping(definition)) continue;
        const compose = { file: file.path, service };
        if (definition.build !== undefined) {
          const context = buildDirectory(definition.build, directory);
          const linked = context === null ? undefined : packages.get(context);
          if (linked === undefined) unmatched = true;
          facts.push({
            type: 'compose-service',
            file: file.path,
            service,
            package: linked ?? null,
            image: null,
            evidence: evidence(file.path, 'compose-build'),
          });
        } else {
          const image =
            typeof definition.image === 'string' ? normalizeImage(definition.image) : null;
          const entry = IMAGE_CATALOG.find((item) => item.image === image);
          facts.push(
            entry
              ? {
                  type: 'resource',
                  kind: entry.kind,
                  technology: entry.technology,
                  label: entry.label,
                  confidence: 'observed',
                  compose,
                  evidence: evidence(file.path, 'compose-image'),
                }
              : {
                  type: 'compose-service',
                  file: file.path,
                  service,
                  package: null,
                  image,
                  evidence: evidence(file.path, 'compose-service'),
                },
          );
        }
        for (const target of dependencies(definition.depends_on)) {
          if (target === service || !isMapping(services[target])) continue;
          facts.push({
            type: 'relation',
            kind: 'depends-on',
            from: { compose },
            to: { compose: { file: file.path, service: target } },
            confidence: 'observed',
            reason: 'compose-depends-on',
            evidence: evidence(file.path, 'compose-depends-on'),
          });
        }
      }
      if (unmatched) gaps.push({ path: file.path, reason: 'unmatched-build-context' });
    }
    return { status: 'complete', facts, gaps };
  },
});
