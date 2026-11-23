/*
 * Canvas keyboard (spec §4.5): arrows pan, + and - zoom, 0 fits, Enter selects the focused
 * component. Never while typing in a field, and never with a modifier held (those belong to the
 * browser, such as Cmd+0 to reset page zoom).
 */

export type CanvasKeyAction =
  | { readonly pan: readonly [number, number] }
  | { readonly zoom: 'in' | 'out' }
  | { readonly fit: true }
  | { readonly select: string }
  | null;

const PAN = 80;
const PANS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [PAN, 0],
  ArrowRight: [-PAN, 0],
  ArrowUp: [0, PAN],
  ArrowDown: [0, -PAN],
};

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

export function canvasKeyAction(
  event: Pick<KeyboardEvent, 'key' | 'target' | 'metaKey' | 'ctrlKey' | 'altKey'>,
): CanvasKeyAction {
  if (event.metaKey || event.ctrlKey || event.altKey || inTextField(event.target)) return null;
  const pan = PANS[event.key];
  if (pan) return { pan };
  if (event.key === '+' || event.key === '=') return { zoom: 'in' };
  if (event.key === '-') return { zoom: 'out' };
  if (event.key === '0') return { fit: true };
  if (event.key === 'Enter' && event.target instanceof Element) {
    const id = event.target.closest<HTMLElement>('.svelte-flow__node[data-id]')?.dataset.id;
    return id ? { select: id } : null;
  }
  return null;
}
