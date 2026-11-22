import { containsHomePath, containsSecretPattern, isValidLabel } from '@archwise/domain';

/*
 * `archwise.workspace` v1: a reviewed list of repositories for one Archwise run. Archwise only
 * reads this file. Problems are reported as `<field path> <condition>` with stable wording.
 */

export interface WorkspaceFileEntry {
  readonly path: string;
  readonly label?: string;
}

export interface WorkspaceFile {
  readonly format: 'archwise.workspace';
  readonly version: 1;
  readonly repositories: readonly WorkspaceFileEntry[];
}

export type WorkspaceFileResult =
  | { readonly ok: true; readonly value: WorkspaceFile }
  | { readonly ok: false; readonly problem: string };

export const MAX_WORKSPACE_REPOSITORIES = 64;

const TOP_FIELDS = new Set(['format', 'version', 'repositories']);
const ENTRY_FIELDS = new Set(['path', 'label']);

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const unknownField = (value: Record<string, unknown>, allowed: ReadonlySet<string>) =>
  Object.keys(value).find((key) => !allowed.has(key));

const validLabel = (value: unknown): value is string =>
  typeof value === 'string' &&
  isValidLabel(value) &&
  !containsHomePath(value) &&
  !containsSecretPattern(value);

export function parseWorkspaceFile(text: string): WorkspaceFileResult {
  const fail = (problem: string): WorkspaceFileResult => ({ ok: false, problem });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('file is not valid JSON');
  }
  if (!isObject(parsed)) return fail('file must be a JSON object');
  const extra = unknownField(parsed, TOP_FIELDS);
  if (extra !== undefined) return fail(`${extra} is not allowed`);
  if (parsed.format !== 'archwise.workspace') return fail('format must be "archwise.workspace"');
  if (parsed.version !== 1) return fail('version must be 1');
  const list = parsed.repositories;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_WORKSPACE_REPOSITORIES) {
    return fail(`repositories must list 1 to ${MAX_WORKSPACE_REPOSITORIES} entries`);
  }
  const repositories: WorkspaceFileEntry[] = [];
  for (const [index, entry] of list.entries()) {
    const at = `repositories[${index}]`;
    if (!isObject(entry)) return fail(`${at} must be a JSON object`);
    const unknown = unknownField(entry, ENTRY_FIELDS);
    if (unknown !== undefined) return fail(`${at}.${unknown} is not allowed`);
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      return fail(`${at}.path must be a non-empty string`);
    }
    if ('label' in entry && !validLabel(entry.label))
      return fail(`${at}.label is not a valid label`);
    repositories.push(
      typeof entry.label === 'string'
        ? { path: entry.path, label: entry.label }
        : { path: entry.path },
    );
  }
  return { ok: true, value: { format: 'archwise.workspace', version: 1, repositories } };
}
