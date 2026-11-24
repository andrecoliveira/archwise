import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Node } from 'yaml';

export type YamlResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/**
 * Parses untrusted YAML as data: YAML 1.2 core schema with `<<` merge keys, unique keys, at most 100 alias
 * resolutions. Any error or warning makes the document invalid. Nothing is executed.
 */
export function parseYaml(text: string): YamlResult {
  const parsed = parseYamlWithLines(text);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
}

export type LineRange = { readonly start: number; readonly end: number };

export type YamlLinesResult =
  | {
      readonly ok: true;
      readonly value: unknown;
      /** 1-based lines of the entry at a key/index path: from its key to its value's last content. */
      readonly lines: (path: readonly (string | number)[]) => LineRange | null;
    }
  | { readonly ok: false };

/** `parseYaml` plus source line ranges for entries, for line-level evidence. */
export function parseYamlWithLines(text: string): YamlLinesResult {
  const lineCounter = new LineCounter();
  try {
    const document = parseDocument(text, {
      schema: 'core',
      uniqueKeys: true,
      merge: true,
      prettyErrors: false,
      lineCounter,
    });
    if (document.errors.length > 0 || document.warnings.length > 0) return { ok: false };
    const value = document.toJS({ maxAliasCount: 100 }) as unknown;
    const lines = (path: readonly (string | number)[]): LineRange | null => {
      let node: unknown = document.contents;
      let from: number | undefined;
      for (const segment of path) {
        if (isMap(node)) {
          const pair = node.items.find(
            (item) => isScalar(item.key) && String(item.key.value) === String(segment),
          );
          if (!pair || !isScalar(pair.key) || !pair.key.range) return null;
          from = pair.key.range[0];
          node = pair.value;
        } else if (isSeq(node) && typeof segment === 'number') {
          node = node.items[segment];
          from = undefined;
        } else {
          return null;
        }
      }
      const range = (node as Node | null)?.range;
      if (!range) return null;
      const start = from ?? range[0];
      let end = range[1];
      while (end > start && /\s/.test(text[end - 1]!)) end -= 1;
      return {
        start: lineCounter.linePos(start).line,
        end: lineCounter.linePos(Math.max(start, end - 1)).line,
      };
    };
    return { ok: true, value, lines };
  } catch {
    return { ok: false };
  }
}
