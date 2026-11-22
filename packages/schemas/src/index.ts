import { z } from 'zod';
export const snapshotEnvelopeSchema = z.object({ version: z.literal(1) }).strict();
export type SnapshotEnvelope = z.infer<typeof snapshotEnvelopeSchema>;

export * from './graph-schema.js';
export * from './parse-graph.js';
export * from './graph-json.js';
export * from './workspace-file.js';
