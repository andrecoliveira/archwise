import type { Graph } from './graph-types.js';

/** The two Studio modes: Explore shows the discovered architecture, Sandbox hypothetical changes. */
export type StudioMode = 'explore' | 'sandbox';

/** Open where there is something to read: Explore when the scan found components, else Sandbox. */
export function initialMode(graph: Graph): StudioMode {
  return graph.nodes.length > 0 ? 'explore' : 'sandbox';
}

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

/**
 * `/` focuses the component search unless the person is typing in a field; Cmd+K or Ctrl+K
 * always does, like a command palette.
 */
export function isSearchShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'target'>,
): boolean {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') return true;
  return event.key === '/' && !event.metaKey && !event.ctrlKey && !isTextField(event.target);
}
