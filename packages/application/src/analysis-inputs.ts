import { compareCodeUnits } from '@archwise/domain';
import type { PackageFact } from './analyzer.js';
import type { InventoryResult } from './inventory.js';
import type { AnalysisRepositoryInput } from './run-analyzers.js';

/** Root-relative path → repository-relative path. */
function withinRepository(repositoryPath: string, path: string): string {
  return repositoryPath === '' ? path : path.slice(repositoryPath.length + 1);
}

const directoryOf = (path: string): string => {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
};

/**
 * Groups the inventory's manifests and analyzer input files per scanned repository, with
 * repository-relative paths, in repository-ID order. Unreached repositories are omitted.
 */
export function analysisInputs(inventory: InventoryResult): AnalysisRepositoryInput[] {
  return inventory.repositories
    .filter((repository) => repository.reached)
    .sort((a, b) => compareCodeUnits(a.id, b.id))
    .map((repository) => {
      const local = (path: string): string => withinRepository(repository.path, path);
      const packages: PackageFact[] = inventory.manifests
        .filter((manifest) => manifest.repositoryId === repository.id)
        .map((manifest) => {
          const path = local(manifest.path);
          return {
            path,
            directory: directoryOf(path),
            name: manifest.name,
            dependencies: manifest.runtimeDependencies,
            devDependencies: manifest.devDependencies,
            workspaces: manifest.workspaces,
          };
        })
        .sort((a, b) => compareCodeUnits(a.path, b.path));
      const files = inventory.files
        .filter((file) => file.repositoryId === repository.id)
        .map((file) => ({ path: local(file.path), text: file.text, problem: file.problem }))
        .sort((a, b) => compareCodeUnits(a.path, b.path));
      return { repository: { id: repository.id, label: repository.label }, files, packages };
    });
}
