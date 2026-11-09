/** Metadata only: importing this module never opens a listener. */
export function healthPayload(): Readonly<{ name: 'archwise'; status: 'foundation' }> {
  return Object.freeze({ name: 'archwise', status: 'foundation' });
}
