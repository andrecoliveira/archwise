import {
  EMPTY_ANALYSIS,
  resolveArchitecture,
  type AnalysisResult,
  type ArchitectureGraph,
  type InventoryResult,
} from '@archwise/application';

export {
  viewNodeId,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type ViewEvidence,
  type ViewGap,
} from '@archwise/application';

/**
 * Builds the deterministic view graph v2: packages and declared dependencies from the
 * inventory, plus analyzer facts. Without analysis, only packages appear: external libraries
 * are not deployed services.
 */
export function buildArchitectureGraph(
  inventory: InventoryResult,
  analysis: AnalysisResult = EMPTY_ANALYSIS,
): ArchitectureGraph {
  return resolveArchitecture(inventory, analysis);
}
