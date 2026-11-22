import type { InventoryRepository } from '@archwise/application';

/** A scanned repository with zero counts, for hand-built inventory results. */
export const repository = (
  fields: Pick<InventoryRepository, 'id' | 'label' | 'path' | 'nested'> &
    Partial<InventoryRepository>,
): InventoryRepository => ({
  rootId: 'repo-root',
  reached: true,
  listedEntries: 0,
  manifests: 0,
  skipped: {},
  ...fields,
});
