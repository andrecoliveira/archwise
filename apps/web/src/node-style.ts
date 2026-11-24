/*
 * Pieces or cards (spec §4.3): pieces read best in the System view; cards stay dense for All
 * packages, Sandbox and large views. The person's choice wins and is remembered per view.
 */

export type NodeStyle = 'pieces' | 'cards';
export type StyleView = 'system' | 'all' | 'sandbox';
export const NODE_STYLE_LIMIT = 80;

/** Canvas footprint of a node in each style; the automatic layout reserves exactly this. */
export const NODE_SIZE: Readonly<
  Record<NodeStyle, { readonly width: number; readonly height: number }>
> = {
  pieces: { width: 232, height: 236 },
  cards: { width: 200, height: 92 },
};

export function nodeStyleFor(view: StyleView, count: number, stored: NodeStyle | null): NodeStyle {
  if (stored) return stored;
  return view === 'system' && count <= NODE_STYLE_LIMIT ? 'pieces' : 'cards';
}

const key = (view: StyleView): string => `archwise.nodeStyle.${view}`;

export function readNodeStyle(
  storage: Pick<Storage, 'getItem'> | null,
  view: StyleView,
): NodeStyle | null {
  try {
    const value = storage?.getItem(key(view));
    return value === 'pieces' || value === 'cards' ? value : null;
  } catch {
    return null;
  }
}

export function writeNodeStyle(
  storage: Pick<Storage, 'setItem'> | null,
  view: StyleView,
  style: NodeStyle,
): void {
  try {
    storage?.setItem(key(view), style);
  } catch {
    // The choice applies for this page; it just is not remembered.
  }
}
