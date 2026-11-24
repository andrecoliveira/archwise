<script lang="ts">
  import { cylinderGeometry } from './kit.js';
  import { isoId } from './ids.js';

  let {
    cx = 0,
    cy = 0,
    z0,
    r,
    h,
    bands = 1,
    tone,
  }: { cx?: number; cy?: number; z0: number; r: number; h: number; bands?: number; tone: string } = $props();

  const id = isoId('cyl');
  const c = $derived(cylinderGeometry({ cx, cy, z0, r, h, bands }));
</script>

<linearGradient {id} x1="0" x2="1" y1="0" y2="0">
  <stop offset="0" style={`stop-color: color-mix(in srgb, ${tone} 80%, var(--lift))`} />
  <stop offset="0.45" style:stop-color={tone} />
  <stop offset="1" style={`stop-color: color-mix(in srgb, ${tone} 60%, var(--sink))`} />
</linearGradient>
<path class="face" d={c.body} fill={`url(#${id})`} />
{#each c.bands as band, i (i)}<path class="band" d={band} />{/each}
<ellipse class="face" cx={c.topCx} cy={c.topCy} rx={c.rx} ry={c.ry}
  style={`fill: color-mix(in srgb, ${tone} 70%, var(--lift))`} />
<ellipse class="band" cx={c.topCx} cy={c.topCy} rx={c.rx * 0.55} ry={c.ry * 0.55} />
