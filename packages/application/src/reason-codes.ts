/*
 * The closed list of reason-code families the resolver and the built-in analyzers emit. A code
 * is `<family>` or `<family>:<parameter>`. The Studio's reason catalog has one sentence per
 * family, and a completeness test compares the two lists.
 */
export const REASON_CODE_FAMILIES = [
  'client-library',
  'compose-build',
  'compose-depends-on',
  'compose-image',
  'compose-service',
  'dependency-declared',
  'framework-dependency',
  'manifest-declared',
  'prisma-datasource',
] as const;
export type ReasonCodeFamily = (typeof REASON_CODE_FAMILIES)[number];

/** The family of a reason code: the text before the first `:`. */
export function reasonFamily(code: string): string {
  const colon = code.indexOf(':');
  return colon === -1 ? code : code.slice(0, colon);
}

/** What an external system is for; only `payments` has a dedicated piece today. */
export const EXTERNAL_CATEGORIES = [
  'payments',
  'email',
  'storage',
  'auth',
  'ai',
  'monitoring',
  'other',
] as const;
export type ExternalCategory = (typeof EXTERNAL_CATEGORIES)[number];
