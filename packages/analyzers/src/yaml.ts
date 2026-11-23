import { parseDocument } from 'yaml';

export type YamlResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/**
 * Parses untrusted YAML as data: YAML 1.2 core schema with `<<` merge keys, unique keys, at most 100 alias
 * resolutions. Any error or warning makes the document invalid. Nothing is executed.
 */
export function parseYaml(text: string): YamlResult {
  try {
    const document = parseDocument(text, {
      schema: 'core',
      uniqueKeys: true,
      merge: true,
      prettyErrors: false,
    });
    if (document.errors.length > 0 || document.warnings.length > 0) return { ok: false };
    return { ok: true, value: document.toJS({ maxAliasCount: 100 }) as unknown };
  } catch {
    return { ok: false };
  }
}
