import {
  CONFIDENCE_LEVELS,
  COVERAGE_STATUSES,
  DIAGNOSTIC_REFERENCE_KINDS,
  DIAGNOSTIC_SEVERITIES,
  EDGE_KINDS,
  GRAPH_FORMAT,
  GRAPH_VERSION,
  LIMITS,
  NODE_KINDS,
  REVISION_STATUSES,
} from '@archwise/domain';
import { z } from 'zod';

/*
 * Structural shape of `archwise.graph` v1. Every object is strict; semantic rules
 * (identifiers, references, paths, secrets, containment) live in @archwise/domain.
 */

const collection = <T extends z.ZodType>(item: T) => z.array(item).max(LIMITS.collection);
const references = z.array(z.string()).max(LIMITS.references);

const confidenceSchema = z.strictObject({
  level: z.enum(CONFIDENCE_LEVELS),
  reasons: references,
});

export const graphRevisionSchema = z.strictObject({
  id: z.string(),
  workspaceId: z.string(),
  parentRevisionId: z.string().nullable(),
  createdAt: z.string(),
  status: z.enum(REVISION_STATUSES),
  repositories: collection(z.strictObject({ id: z.string(), label: z.string() })),
  coverage: collection(
    z.strictObject({
      repositoryId: z.string(),
      analyzerId: z.string(),
      analyzerVersion: z.string(),
      status: z.enum(COVERAGE_STATUSES),
    }),
  ),
  evidence: collection(
    z.strictObject({
      id: z.string(),
      repositoryId: z.string(),
      analyzerId: z.string(),
      analyzerVersion: z.string(),
      ruleId: z.string(),
      path: z.string(),
      lines: z.strictObject({ start: z.number(), end: z.number() }).nullable(),
    }),
  ),
  nodes: collection(
    z.strictObject({
      id: z.string(),
      kind: z.enum(NODE_KINDS),
      label: z.string(),
      repositoryId: z.string().nullable(),
      confidence: confidenceSchema,
      evidenceIds: references,
    }),
  ),
  edges: collection(
    z.strictObject({
      id: z.string(),
      kind: z.enum(EDGE_KINDS),
      sourceId: z.string(),
      targetId: z.string(),
      confidence: confidenceSchema,
      evidenceIds: references,
    }),
  ),
  diagnostics: collection(
    z.strictObject({
      id: z.string(),
      severity: z.enum(DIAGNOSTIC_SEVERITIES),
      code: z.string(),
      references: z
        .array(z.strictObject({ kind: z.enum(DIAGNOSTIC_REFERENCE_KINDS), id: z.string() }))
        .max(LIMITS.references),
    }),
  ),
});

export const graphEnvelopeSchema = z.strictObject({
  format: z.literal(GRAPH_FORMAT),
  version: z.literal(GRAPH_VERSION),
  revision: graphRevisionSchema,
});
