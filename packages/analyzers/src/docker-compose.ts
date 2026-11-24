import { maskConfigValue } from '@archwise/domain';
import type {
  Analyzer,
  ComposePropertyName,
  AnalyzerInput,
  AnalyzerOutput,
  CoverageGap,
  Fact,
  FactEvidence,
} from '@archwise/application';
import { IMAGE_CATALOG } from './catalog.js';
import { basenamePosix, dirnamePosix, joinPosix, normalizePosix } from './paths.js';
import { parseYamlWithLines, type LineRange } from './yaml.js';

const BASE_FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
/** Overrides and environment variants (`compose.prod.yaml`, ...): reported, never merged. */
const VARIANT_FILES = [
  'compose.*.yaml',
  'compose.*.yml',
  'docker-compose.*.yaml',
  'docker-compose.*.yml',
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

const evidence = (path: string, ruleId: string, lines: LineRange | null): FactEvidence[] => [
  { path, lines, ruleId },
];

const PORT_NUMBER = /^\d+(?:-\d+)?$/;

const scalarText = (value: unknown): string | undefined =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;

/** One port entry as `host:container` or `container`, numbers only; null when none is literal. */
function portValue(entry: unknown): string | null {
  let host: string | undefined;
  let container: string | undefined;
  if (typeof entry === 'number') container = String(entry);
  else if (typeof entry === 'string') {
    const parts = entry.split('/')[0]!.split(':');
    container = parts[parts.length - 1];
    host = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  } else if (isMapping(entry)) {
    container = scalarText(entry.target);
    host = scalarText(entry.published);
  }
  if (container === undefined || !PORT_NUMBER.test(container)) return null;
  return host !== undefined && PORT_NUMBER.test(host) ? `${host}:${container}` : container;
}

/** The allowlisted value of one Compose key as text, or null when it has none. */
function propertyValue(name: ComposePropertyName, definition: Mapping): string | null {
  const value = definition[name];
  switch (name) {
    case 'image':
      return typeof value === 'string' ? value : null;
    case 'build': {
      const context =
        typeof value === 'string' ? value : isMapping(value) ? (value.context ?? '.') : null;
      return typeof context === 'string' ? context : null;
    }
    case 'ports': {
      const ports = Array.isArray(value) ? value.map(portValue).filter((p) => p !== null) : [];
      return ports.length > 0 ? ports.join(', ') : null;
    }
    case 'depends_on': {
      const names = dependencies(value);
      return names.length > 0 ? names.join(', ') : null;
    }
  }
}

const PROPERTY_NAMES: readonly ComposePropertyName[] = ['image', 'build', 'ports', 'depends_on'];

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
 * Docker Compose as data. Reads only `image`, `build`, `ports` and `depends_on` of each
 * service, and keeps their values (masked) as properties; environment, env files, secrets,
 * labels, configs and commands are never looked at. Interpolation is not
 * resolved. Override and variant files (`compose.<name>.yaml`) are reported as unsupported.
 */
export const dockerCompose: Analyzer = Object.freeze({
  descriptor: Object.freeze({
    id: 'docker-compose',
    version: '1.1.0',
    inputs: Object.freeze({ fileNames: [...BASE_FILES, ...VARIANT_FILES].sort(), extensions: [] }),
    budget: Object.freeze({ timeMs: 3000, maxFiles: 200 }),
  }),
  analyze(input: AnalyzerInput): AnalyzerOutput {
    const facts: Fact[] = [];
    const gaps: CoverageGap[] = [];
    const packages = new Map(input.packages.map((pkg) => [pkg.directory, pkg.path]));
    for (const file of input.files) {
      if (!BASE_FILES.includes(basenamePosix(file.path))) {
        gaps.push({ path: file.path, reason: 'unsupported' });
        continue;
      }
      const parsed = parseYamlWithLines(file.text);
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
        const serviceLines = parsed.lines(['services', service]);
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
            evidence: evidence(file.path, 'compose-build', serviceLines),
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
                  evidence: evidence(file.path, 'compose-image', serviceLines),
                }
              : {
                  type: 'compose-service',
                  file: file.path,
                  service,
                  package: null,
                  image,
                  evidence: evidence(file.path, 'compose-service', serviceLines),
                },
          );
        }
        const dependsOnLines = parsed.lines(['services', service, 'depends_on']);
        for (const target of dependencies(definition.depends_on)) {
          if (target === service || !isMapping(services[target])) continue;
          facts.push({
            type: 'relation',
            kind: 'depends-on',
            from: { compose },
            to: { compose: { file: file.path, service: target } },
            confidence: 'observed',
            reason: 'compose-depends-on',
            evidence: evidence(file.path, 'compose-depends-on', dependsOnLines),
          });
        }
        for (const name of PROPERTY_NAMES) {
          const value = propertyValue(name, definition);
          if (value === null) continue;
          facts.push({
            type: 'compose-property',
            compose,
            name,
            value: maskConfigValue(value),
            evidence: evidence(
              file.path,
              'compose-property',
              parsed.lines(['services', service, name]),
            ),
          });
        }
      }
      if (unmatched) gaps.push({ path: file.path, reason: 'unmatched-build-context' });
    }
    return { status: 'complete', facts, gaps };
  },
});
