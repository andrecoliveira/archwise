import type { Edge, Node } from '@xyflow/svelte';
import { focusSet } from './focus.js';

/*
 * Canvas decoration (spec §4.5): the Studio's selection is the single source of truth for what
 * Svelte Flow marks selected. In Explore, focus dims what the selection does not connect to and
 * limits animation to it. A selection that is not on the canvas (filtered out, or hidden in the
 * System view) counts as no selection, so it never dims everything that is visible.
 */

const DISCOVERED_NODE_TYPES = new Set(['iso', 'discovered']);

export function decorate(
  list: readonly Node[],
  links: readonly Edge[],
  options: { readonly selected: string | null; readonly focus: boolean },
): { nodes: Node[]; edges: Edge[] } {
  const onCanvas = options.selected !== null && list.some((item) => item.id === options.selected);
  const selected = onCanvas ? options.selected : null;
  const focus = options.focus
    ? focusSet(
        links.filter((edge) => edge.data?.origin === 'discovered'),
        selected,
      )
    : null;
  const inFocus = (id: string): boolean => focus === null || focus.nodes.has(id);
  const key = (edge: Edge): string => `${edge.source}->${edge.target}`;
  return {
    nodes: list.map((item) => {
      const marked = { ...item, selected: item.id === selected };
      return DISCOVERED_NODE_TYPES.has(item.type ?? '')
        ? {
            ...marked,
            data: { ...item.data, dimmed: !inFocus(item.id), animated: inFocus(item.id) },
          }
        : marked;
    }),
    edges: links.map((edge) =>
      edge.data?.origin === 'discovered'
        ? {
            ...edge,
            data: {
              ...edge.data,
              focused: focus?.edges.has(key(edge)) ?? false,
              dimmed: focus !== null && !focus.edges.has(key(edge)),
              animated: true,
            },
          }
        : edge,
    ),
  };
}

/** Screen-reader help that matches this canvas: arrows pan, nothing is deleted from the keyboard. */
export const CANVAS_A11Y = {
  'node.a11yDescription.default':
    'Press Enter or Space to select this component and show it in the inspector. Arrow keys pan the view.',
  'node.a11yDescription.keyboardDisabled':
    'Press Enter or Space to select this component and show it in the inspector.',
  'edge.a11yDescription.default': 'A relation between two components.',
} as const;
