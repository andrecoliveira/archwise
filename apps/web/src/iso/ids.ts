/** Unique SVG ids for gradients, clips and patterns. They start with "iso" so they never look like hex colours. */
let next = 0;
export function isoId(kind: string): string {
  next += 1;
  return `iso-${kind}-${next}`;
}
