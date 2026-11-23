import { createHash } from 'node:crypto';
import { redactSensitiveText } from '@archwise/domain';

const FRAMEWORKS = ['next', 'expo', 'react-native', 'vite', 'fastify', 'express', '@nestjs/core'];
const SNIFF_BYTES = 8192;

export interface ParsedManifest {
  readonly name: string;
  readonly framework: string | null;
  readonly dependencies: readonly string[];
  readonly runtimeDependencies: readonly string[];
  readonly devDependencies: readonly string[];
  readonly workspaces: readonly string[] | null;
  readonly sha256: string;
}

export type ManifestOutcome =
  | { readonly kind: 'ok'; readonly manifest: ParsedManifest }
  | { readonly kind: 'binary' }
  | { readonly kind: 'invalid' };

/** True when the first 8 KiB contain a NUL byte. */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, SNIFF_BYTES).includes(0);
}

/**
 * Parses `package.json` bytes as data. Names are untrusted text: home directories and secret
 * shapes are redacted before they can reach a graph, the store or an output.
 */
export function parseManifest(
  bytes: Uint8Array,
  fallbackName: string,
  knownHomes: readonly string[],
): ManifestOutcome {
  if (looksBinary(bytes)) return { kind: 'binary' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
  } catch {
    return { kind: 'invalid' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' };
  const data = parsed as Record<string, unknown>;
  const redact = (text: string): string => redactSensitiveText(text, knownHomes);
  const names = (value: unknown): string[] =>
    [
      ...new Set(
        (value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []).map(
          redact,
        ),
      ),
    ].sort();
  const runtimeDependencies = names(data.dependencies);
  const devDependencies = names(data.devDependencies);
  const unique = [...new Set([...runtimeDependencies, ...devDependencies])].sort();
  const globs = Array.isArray(data.workspaces)
    ? (data.workspaces as unknown[])
    : data.workspaces && typeof data.workspaces === 'object'
      ? (data.workspaces as Record<string, unknown>).packages
      : null;
  const workspaces = Array.isArray(globs)
    ? globs.filter((item): item is string => typeof item === 'string').map(redact)
    : null;
  return {
    kind: 'ok',
    manifest: {
      name: typeof data.name === 'string' ? redact(data.name) : fallbackName,
      framework: FRAMEWORKS.find((item) => unique.includes(item)) ?? null,
      dependencies: unique,
      runtimeDependencies,
      devDependencies,
      workspaces,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}
