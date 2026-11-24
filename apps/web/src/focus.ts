/** What a selection brings into focus: itself, its direct neighbours and the relations between them. */
export function focusSet(
  edges: readonly { readonly source: string; readonly target: string }[],
  selected: string | null,
): { nodes: Set<string>; edges: Set<string> } | null {
  if (selected === null) return null;
  const nodes = new Set([selected]);
  const focused = new Set<string>();
  for (const edge of edges) {
    if (edge.source !== selected && edge.target !== selected) continue;
    nodes.add(edge.source);
    nodes.add(edge.target);
    focused.add(`${edge.source}->${edge.target}`);
  }
  return { nodes, edges: focused };
}
