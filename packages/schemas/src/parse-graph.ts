import {
  createRevision,
  GRAPH_FORMAT,
  GRAPH_VERSION,
  type GraphRevision,
  type IssuePath,
  type ValidationIssue,
  type ValidationResult,
} from '@archwise/domain';
import { graphEnvelopeSchema } from './graph-schema.js';

export type GraphParseErrorCode =
  | 'invalid-format'
  | 'malformed-version'
  | 'unsupported-older-version'
  | 'unsupported-future-version'
  | 'invalid-structure'
  | 'unknown-field';

const fail = (code: GraphParseErrorCode, path: IssuePath): ValidationResult<never> => ({
  ok: false,
  issues: [{ code, path }],
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toPath = (path: readonly PropertyKey[]): IssuePath =>
  path.map((key) => (typeof key === 'number' ? key : String(key)));

/**
 * Parses untrusted input into a validated, frozen revision. Issues carry stable codes and
 * structural paths only: never Zod messages, rejected values, or unknown key names.
 */
export function parseGraphEnvelope(input: unknown): ValidationResult<GraphRevision> {
  if (!isPlainObject(input)) return fail('invalid-format', []);
  if (input.format !== GRAPH_FORMAT) return fail('invalid-format', ['format']);

  const version = input.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) {
    return fail('malformed-version', ['version']);
  }
  if (version < GRAPH_VERSION) return fail('unsupported-older-version', ['version']);
  if (version > GRAPH_VERSION) return fail('unsupported-future-version', ['version']);

  const parsed = graphEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue): ValidationIssue => ({
        code: issue.code === 'unrecognized_keys' ? 'unknown-field' : 'invalid-structure',
        path: toPath(issue.path),
      })),
    };
  }

  const result = createRevision(parsed.data.revision);
  if (result.ok) return result;
  return {
    ok: false,
    issues: result.issues.map((issue) => ({ code: issue.code, path: ['revision', ...issue.path] })),
  };
}
