/*
 * Analyzer contract (Phase 4). Analyzers are pure, synchronous functions over text that
 * discovery has already read within budgets. They never touch the filesystem, execute code or
 * read deny-listed files; they emit facts that the resolver turns into the architecture graph.
 * An analyzer can be written outside the core: it needs only these types.
 */

export const RESOURCE_KINDS = ['datastore', 'queue', 'external-system'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const FACT_CONFIDENCES = ['observed', 'inferred'] as const;
export type FactConfidence = (typeof FACT_CONFIDENCES)[number];

export interface FactEvidence {
  /** Repository-relative, '/'-separated. */
  readonly path: string;
  readonly lines: { readonly start: number; readonly end: number } | null;
  readonly ruleId: string;
}

export interface ComposeRef {
  readonly file: string;
  readonly service: string;
}

export type FactRef =
  /** Repository-relative manifest path, such as 'apps/api/package.json'. */
  | { readonly package: string }
  | { readonly compose: ComposeRef }
  | { readonly resource: { readonly kind: ResourceKind; readonly technology: string } };

export type Fact =
  | {
      readonly type: 'package-role';
      readonly package: string;
      readonly role: 'frontend' | 'service';
      readonly technology: string;
      readonly confidence: FactConfidence;
      readonly reason: string;
      readonly evidence: readonly FactEvidence[];
    }
  | {
      readonly type: 'outside-workspace';
      readonly package: string;
      readonly evidence: readonly FactEvidence[];
    }
  | {
      readonly type: 'resource';
      readonly kind: ResourceKind;
      readonly technology: string;
      readonly label: string;
      readonly confidence: FactConfidence;
      readonly compose: ComposeRef | null;
      readonly evidence: readonly FactEvidence[];
    }
  | {
      readonly type: 'compose-service';
      readonly file: string;
      readonly service: string;
      readonly package: string | null;
      readonly image: string | null;
      readonly evidence: readonly FactEvidence[];
    }
  | {
      readonly type: 'datastore-technology';
      readonly package: string;
      readonly technology: string;
      readonly label: string;
      readonly evidence: readonly FactEvidence[];
    }
  | {
      readonly type: 'relation';
      readonly kind: 'depends-on';
      readonly from: FactRef;
      readonly to: FactRef;
      readonly confidence: FactConfidence;
      readonly reason: string;
      readonly evidence: readonly FactEvidence[];
    };

export const GAP_REASONS = [
  'unsupported',
  'invalid-syntax',
  'too-large',
  'binary',
  'unreadable',
  'budget',
  'unmatched-build-context',
  'unidentified-datastore',
] as const;
export type GapReason = (typeof GAP_REASONS)[number];

export interface CoverageGap {
  readonly path: string;
  readonly reason: GapReason;
}

export interface PackageFact {
  /** Repository-relative manifest path. */
  readonly path: string;
  /** Repository-relative directory; '' for the repository root. */
  readonly directory: string;
  readonly name: string;
  /** Runtime `dependencies` only. */
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  /** `workspaces` globs from package.json (array or `{ packages }`), else null. */
  readonly workspaces: readonly string[] | null;
}

export interface AnalyzerDescriptor {
  /** Kebab-case, unique. */
  readonly id: string;
  /** Semver; recorded in evidence and coverage. */
  readonly version: string;
  readonly inputs: {
    /** Base names; one `*` matches one or more characters, as in `compose.*.yaml`. */
    readonly fileNames: readonly string[];
    /** Name suffixes such as '.prisma'. */
    readonly extensions: readonly string[];
  };
  readonly budget: { readonly timeMs: number; readonly maxFiles: number };
}

export interface AnalyzerInput {
  readonly repository: { readonly id: string; readonly label: string };
  /** Repository-relative, '/'-separated, sorted by path. */
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly packages: readonly PackageFact[];
  /** Epoch milliseconds; check with `shouldStop`. */
  readonly deadline: number;
  readonly signal: AbortSignal;
  readonly now: () => number;
}

export interface AnalyzerOutput {
  readonly status: 'complete' | 'partial';
  readonly facts: readonly Fact[];
  readonly gaps: readonly CoverageGap[];
}

export interface Analyzer {
  readonly descriptor: AnalyzerDescriptor;
  analyze(input: AnalyzerInput): AnalyzerOutput;
}

/**
 * True when a base name matches a declared file name. A pattern may contain one `*`, which
 * matches one or more characters; anything else is compared exactly. Linear time.
 */
export function matchesInputName(name: string, pattern: string): boolean {
  const star = pattern.indexOf('*');
  if (star === -1) return name === pattern;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (
    name.length > prefix.length + suffix.length && name.startsWith(prefix) && name.endsWith(suffix)
  );
}

/** Cooperative stop check for long analyzers. */
export function shouldStop(input: AnalyzerInput): boolean {
  return input.signal.aborted || input.now() > input.deadline;
}

type Shape = Record<string, unknown>;

function isRecord(value: unknown): value is Shape {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasKeys(value: Shape, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isLine = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1;
const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

function isEvidenceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item: unknown) =>
        isRecord(item) &&
        hasKeys(item, ['path', 'lines', 'ruleId']) &&
        isString(item.path) &&
        isString(item.ruleId) &&
        (item.lines === null ||
          (isRecord(item.lines) &&
            hasKeys(item.lines, ['start', 'end']) &&
            isLine(item.lines.start) &&
            isLine(item.lines.end) &&
            (item.lines.end as number) >= (item.lines.start as number))),
    )
  );
}

function isComposeRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasKeys(value, ['file', 'service']) &&
    isString(value.file) &&
    isString(value.service)
  );
}

function isRef(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (hasKeys(value, ['package'])) return isString(value.package);
  if (hasKeys(value, ['compose'])) return isComposeRef(value.compose);
  if (hasKeys(value, ['resource'])) {
    const resource = value.resource;
    return (
      isRecord(resource) &&
      hasKeys(resource, ['kind', 'technology']) &&
      oneOf(resource.kind, RESOURCE_KINDS) &&
      isString(resource.technology)
    );
  }
  return false;
}

/** Strict structural check of one fact: exact keys, enum values and evidence shapes. */
export function isFact(value: unknown): value is Fact {
  if (!isRecord(value) || !isEvidenceList(value.evidence)) return false;
  switch (value.type) {
    case 'package-role':
      return (
        hasKeys(value, [
          'type',
          'package',
          'role',
          'technology',
          'confidence',
          'reason',
          'evidence',
        ]) &&
        isString(value.package) &&
        oneOf(value.role, ['frontend', 'service'] as const) &&
        isString(value.technology) &&
        oneOf(value.confidence, FACT_CONFIDENCES) &&
        isString(value.reason)
      );
    case 'outside-workspace':
      return hasKeys(value, ['type', 'package', 'evidence']) && isString(value.package);
    case 'resource':
      return (
        hasKeys(value, [
          'type',
          'kind',
          'technology',
          'label',
          'confidence',
          'compose',
          'evidence',
        ]) &&
        oneOf(value.kind, RESOURCE_KINDS) &&
        isString(value.technology) &&
        isString(value.label) &&
        oneOf(value.confidence, FACT_CONFIDENCES) &&
        (value.compose === null || isComposeRef(value.compose))
      );
    case 'compose-service':
      return (
        hasKeys(value, ['type', 'file', 'service', 'package', 'image', 'evidence']) &&
        isString(value.file) &&
        isString(value.service) &&
        (value.package === null || isString(value.package)) &&
        (value.image === null || isString(value.image))
      );
    case 'datastore-technology':
      return (
        hasKeys(value, ['type', 'package', 'technology', 'label', 'evidence']) &&
        isString(value.package) &&
        isString(value.technology) &&
        isString(value.label)
      );
    case 'relation':
      return (
        hasKeys(value, ['type', 'kind', 'from', 'to', 'confidence', 'reason', 'evidence']) &&
        value.kind === 'depends-on' &&
        isRef(value.from) &&
        isRef(value.to) &&
        oneOf(value.confidence, FACT_CONFIDENCES) &&
        isString(value.reason)
      );
    default:
      return false;
  }
}

/** Strict structural check of one analyzer-emitted gap. */
export function isCoverageGap(value: unknown): value is CoverageGap {
  return (
    isRecord(value) &&
    hasKeys(value, ['path', 'reason']) &&
    isString(value.path) &&
    oneOf(value.reason, GAP_REASONS)
  );
}
