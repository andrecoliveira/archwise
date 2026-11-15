import {
  canonicalizeRevision,
  GRAPH_FORMAT,
  GRAPH_VERSION,
  LIMITS,
  validateRevision,
  type GraphRevision,
  type ValidationResult,
} from '@archwise/domain';
import { parseGraphEnvelope } from './parse-graph.js';

/** Imports `archwise.graph` JSON text, enforcing the byte limit before parsing. */
export function importGraphJson(text: string): ValidationResult<GraphRevision> {
  // Each UTF-16 unit encodes to at least one byte, so long strings are rejected without encoding.
  if (
    text.length > LIMITS.importBytes ||
    new TextEncoder().encode(text).byteLength > LIMITS.importBytes
  ) {
    return { ok: false, issues: [{ code: 'input-too-large', path: [] }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ code: 'invalid-json', path: [] }] };
  }
  return parseGraphEnvelope(parsed);
}

/**
 * Canonical, compact serialization: validated again, declared fields only, explicit field
 * order, code-unit sorted collections, no trailing newline. Identical revisions produce
 * identical UTF-8 bytes on every platform.
 */
export function serializeGraphRevision(revision: GraphRevision): ValidationResult<string> {
  const issues = validateRevision(revision);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: JSON.stringify({
      format: GRAPH_FORMAT,
      version: GRAPH_VERSION,
      revision: canonicalizeRevision(revision),
    }),
  };
}
