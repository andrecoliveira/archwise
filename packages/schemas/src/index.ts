import { z } from 'zod';
export const snapshotEnvelopeSchema = z.object({ version: z.literal(1) }).strict();
export type SnapshotEnvelope = z.infer<typeof snapshotEnvelopeSchema>;
