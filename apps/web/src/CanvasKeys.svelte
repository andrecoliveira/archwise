<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';
  import type { CanvasKeyAction } from './canvas-keys.js';

  let { onSelect }: { onSelect: (id: string) => void } = $props();
  const flow = useSvelteFlow();

  /** Applies a keyboard action to the viewport; returns whether it was handled. */
  export function apply(action: CanvasKeyAction): boolean {
    if (action === null) return false;
    if ('pan' in action) {
      const viewport = flow.getViewport();
      void flow.setViewport({ x: viewport.x + action.pan[0], y: viewport.y + action.pan[1], zoom: viewport.zoom });
    } else if ('zoom' in action) {
      void (action.zoom === 'in' ? flow.zoomIn({ duration: 0 }) : flow.zoomOut({ duration: 0 }));
    } else if ('fit' in action) {
      void flow.fitView({ duration: 0 });
    } else {
      onSelect(action.select);
    }
    return true;
  }
</script>
