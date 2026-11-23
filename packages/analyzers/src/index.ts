import type { Analyzer } from '@archwise/application';
import { dockerCompose } from './docker-compose.js';
import { nodeRoles } from './node-roles.js';
import { nodeWorkspace } from './node-workspace.js';
import { prismaSchema } from './prisma-schema.js';

export * from './catalog.js';
export * from './paths.js';
export { dockerCompose, normalizeImage } from './docker-compose.js';
export { nodeRoles } from './node-roles.js';
export { nodeWorkspace } from './node-workspace.js';
export { prismaSchema } from './prisma-schema.js';
export { matchesWorkspaceGlob } from './workspace-globs.js';
export { parseYaml, type YamlResult } from './yaml.js';

/** The built-in analyzers, sorted by ID. */
export const BUILTIN_ANALYZERS: readonly Analyzer[] = Object.freeze([
  dockerCompose,
  nodeRoles,
  nodeWorkspace,
  prismaSchema,
]);
