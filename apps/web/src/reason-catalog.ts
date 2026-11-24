import type { GraphEvidence, GraphNode } from './graph-types.js';

/*
 * The reason catalog (spec §5.3): reason codes stay the stored data; the Studio reads each one
 * as a sentence that names its parameter and, when it can, the file and line that state it.
 * A code the catalog does not know renders as the raw code, never as an empty line.
 */

export type SentencePart = { readonly text: string; readonly strong?: true };

export interface ReasonView {
  readonly code: string;
  readonly parts: readonly SentencePart[];
  /** "apps/api/package.json" or "compose.yaml · line 14"; null when no evidence matches. */
  readonly file: string | null;
  readonly known: boolean;
}

export interface ReasonContext {
  /** The component the reason is about, or a relation's source. */
  readonly subject: GraphNode;
  /** A relation's target. */
  readonly target?: GraphNode;
  readonly evidence: readonly GraphEvidence[];
}

type Sentence = (param: string, context: ReasonContext) => SentencePart[];

const plain = (text: string): SentencePart => ({ text });
const strong = (text: string): SentencePart => ({ text, strong: true });
const nameOf = (node: GraphNode | undefined): string => node?.technology ?? node?.label ?? '';

const SENTENCES: Readonly<Record<string, Sentence>> = {
  'client-library': (param, { target }) =>
    param === ''
      ? [plain('a package depends on its client library')]
      : [
          plain('depends on '),
          strong(param),
          plain(target ? `, a ${nameOf(target)} client library` : ', a client library'),
        ],
  'compose-build': (param) => [plain('Compose builds it as service '), strong(param)],
  'compose-depends-on': (_param, { target }) => [
    plain('Compose starts it after '),
    strong(target?.label ?? 'another service'),
  ],
  'compose-image': (_param, { subject }) => [
    plain('Compose runs the '),
    strong(subject.technology ?? subject.label),
    plain(' image'),
  ],
  'compose-service': () => [plain('Compose declares it as a service')],
  'dependency-declared': (_param, { target }) => [
    plain('package.json lists '),
    strong(target?.label ?? 'a workspace package'),
    plain(' as a dependency'),
  ],
  'framework-dependency': (param, { subject }) => {
    const names = param.split(',').filter((name) => name !== '');
    const role = subject.type === 'frontend' ? 'frontend' : 'server';
    if (names.length === 0) return [plain(`depends on a ${role} framework`)];
    if (names.length === 1) {
      return [plain('depends on '), strong(names[0] ?? ''), plain(`, a ${role} framework`)];
    }
    const parts: SentencePart[] = [plain('depends on ')];
    names.forEach((name, index) => {
      if (index > 0) parts.push(plain(index === names.length - 1 ? ' and ' : ', '));
      parts.push(strong(name));
    });
    parts.push(plain(`; the ${role} framework wins`));
    return parts;
  },
  'manifest-declared': () => [plain('its package.json declares it')],
  'prisma-datasource': (_param, { subject, target }) => [
    plain('Prisma datasource is '),
    strong(nameOf(target ?? subject)),
  ],
};

export const REASON_SENTENCE_FAMILIES: readonly string[] = Object.keys(SENTENCES);

/** Which evidence rule states each family; a reason shows the first matching item's file. */
export const REASON_EVIDENCE_KIND: Readonly<Record<string, string>> = {
  'client-library': 'client-library',
  'compose-build': 'compose-build',
  'compose-depends-on': 'compose-depends-on',
  'compose-image': 'compose-image',
  'compose-service': 'compose-service',
  'dependency-declared': 'package-dependency',
  'framework-dependency': 'framework-dependency',
  'manifest-declared': 'package-manifest',
  'prisma-datasource': 'prisma-datasource',
};

export function evidenceFile(item: GraphEvidence): string {
  if (item.lines === null) return item.path;
  return item.lines.start === item.lines.end
    ? `${item.path} · line ${item.lines.start}`
    : `${item.path} · lines ${item.lines.start}–${item.lines.end}`;
}

/** Identity of an evidence item across scans: path, rule, analyzer and lines. */
export function evidenceKey(item: GraphEvidence): string {
  return [item.path, item.kind, item.analyzer, item.lines?.start ?? '', item.lines?.end ?? ''].join(
    '\u0000',
  );
}

export function describeReason(code: string, context: ReasonContext): ReasonView {
  const colon = code.indexOf(':');
  const family = colon === -1 ? code : code.slice(0, colon);
  const param = colon === -1 ? '' : code.slice(colon + 1);
  const sentence = Object.hasOwn(SENTENCES, family) ? SENTENCES[family] : undefined;
  if (!sentence) {
    return {
      code,
      parts: [plain(code === '' ? '(no reason recorded)' : code)],
      file: null,
      known: false,
    };
  }
  const kind = REASON_EVIDENCE_KIND[family];
  const item = context.evidence.find((candidate) => candidate.kind === kind);
  return {
    code,
    parts: sentence(param, context),
    file: item ? evidenceFile(item) : null,
    known: true,
  };
}
