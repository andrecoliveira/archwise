<script lang="ts">
  import IsoCylinder from '../IsoCylinder.svelte';
  import { project } from '../kit.js';
  import { isoId } from '../ids.js';

  let { tone }: { tone: string; moving?: boolean } = $props();
  const [x, y] = project(0, 0, 80);
  const R = 48;
  const id = isoId('globe');
</script>

<!-- Globe on a stand (external system). -->
<IsoCylinder z0={12} r={9} h={26} tone="color-mix(in srgb, var(--plinth) 70%, var(--ink-3))" />
<radialGradient {id} cx="35%" cy="30%" r="75%">
  <stop offset="0" style={`stop-color: color-mix(in srgb, ${tone} 55%, var(--lift))`} />
  <stop offset="0.6" style:stop-color={tone} />
  <stop offset="1" style={`stop-color: color-mix(in srgb, ${tone} 60%, var(--sink))`} />
</radialGradient>
<circle class="face" cx={x} cy={y} r={R} fill={`url(#${id})`} />
<g class="globe">
  <ellipse cx={x} cy={y} rx={R} ry={R * 0.32} />
  <ellipse cx={x} cy={y} rx={R * 0.45} ry={R} />
  <path d={`M${x} ${y - R}V${y + R}`} />
</g>
