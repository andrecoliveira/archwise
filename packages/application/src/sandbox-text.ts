/** Size limit shared with the Studio's archwise-sandbox import. */
export const MAX_SANDBOX_BYTES = 262_144;

export interface SandboxSummary {
  readonly componentCount: number;
  readonly hasSnapshots: boolean;
}

export type SandboxInspection =
  | { readonly ok: true; readonly summary: SandboxSummary }
  | { readonly ok: false; readonly code: 'too-large' | 'invalid-sandbox' };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Envelope check only. The Studio performs full archwise-sandbox validation before applying a
 * document; the store must merely refuse oversized or non-sandbox payloads.
 */
export function inspectSandboxText(text: string): SandboxInspection {
  if (new TextEncoder().encode(text).byteLength > MAX_SANDBOX_BYTES) {
    return { ok: false, code: 'too-large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: 'invalid-sandbox' };
  }
  if (
    !isObject(parsed) ||
    parsed.format !== 'archwise-sandbox' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.nodes) ||
    !isObject(parsed.draft)
  ) {
    return { ok: false, code: 'invalid-sandbox' };
  }
  const draft = parsed.draft;
  return {
    ok: true,
    summary: {
      componentCount: parsed.nodes.length,
      hasSnapshots:
        (draft.savedA !== null && draft.savedA !== undefined) ||
        (draft.savedB !== null && draft.savedB !== undefined),
    },
  };
}
