import {
  LineCounter,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node,
  type Pair,
  type YAMLMap,
} from 'yaml';

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
    /** Follows aliases to the node they name (bounded, like `maxAliasCount`). */
    const resolved = (node: unknown): unknown => {
      let current = node;
      for (let hops = 0; isAlias(current) && hops < 100; hops += 1) {
        current = current.resolve(document);
      }
      return current;
    };
    /** The pair for a key: the map's own key wins, then `<<` merges, depth-first. */
    const pairOf = (map: YAMLMap, key: string, depth = 0): Pair | undefined => {
      const own = map.items.find((item) => isScalar(item.key) && String(item.key.value) === key);
      if (own || depth > 16) return own;
      for (const item of map.items) {
        // With `merge: true` the parser marks a merge key's value as the symbol `<<`.
        const marker: unknown = isScalar(item.key) ? item.key.value : undefined;
        if (marker !== '<<' && !(typeof marker === 'symbol' && marker.description === '<<')) {
          continue;
        }
        const value = resolved(item.value);
        const sources = isSeq(value) ? value.items.map(resolved) : [value];
        for (const source of sources) {
          const found = isMap(source) ? pairOf(source, key, depth + 1) : undefined;
          if (found) return found;
        }
      }
      return undefined;
    };
    const lines = (path: readonly (string | number)[]): LineRange | null => {
      let node: unknown = document.contents;
      let from: number | undefined;
      for (const segment of path) {
        node = resolved(node);
        if (isMap(node)) {
          const pair = pairOf(node, String(segment));
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
      const range = (resolved(node) as Node | null)?.range;
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
