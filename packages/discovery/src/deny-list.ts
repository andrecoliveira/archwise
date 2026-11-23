/*
 * Files no analyzer may read, whatever it declares: environment files, keys and credential
 * stores. Matching is by name and by directory segment; it never reads the file to decide.
 */

const DENIED_DIRECTORIES: ReadonlySet<string> = new Set(['.ssh', '.aws', '.gnupg']);
const DENIED_NAMES: ReadonlySet<string> = new Set(['.env', '.npmrc', '.netrc']);

/** True when a root-relative, '/'-separated path must never be read for analyzers. */
export function isDeniedInput(rootRelativePath: string): boolean {
  const segments = rootRelativePath.split('/');
  const name = segments[segments.length - 1] ?? '';
  if (segments.slice(0, -1).some((segment) => DENIED_DIRECTORIES.has(segment))) return true;
  return (
    DENIED_NAMES.has(name) ||
    name.startsWith('.env.') ||
    name.startsWith('id_rsa') ||
    name.endsWith('.pem') ||
    name.endsWith('.key')
  );
}
