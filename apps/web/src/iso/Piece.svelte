<script lang="ts">
  import { prefersReducedMotion } from 'svelte/motion';
  import { PIECE_FILL, type PieceName } from './piece-map.js';
  import CachePiece from './pieces/CachePiece.svelte';
  import DatastorePiece from './pieces/DatastorePiece.svelte';
  import FrontendPiece from './pieces/FrontendPiece.svelte';
  import GlobePiece from './pieces/GlobePiece.svelte';
  import JobPiece from './pieces/JobPiece.svelte';
  import LoadBalancerPiece from './pieces/LoadBalancerPiece.svelte';
  import ModulePiece from './pieces/ModulePiece.svelte';
  import PaymentsPiece from './pieces/PaymentsPiece.svelte';
  import QueuePiece from './pieces/QueuePiece.svelte';
  import ServicePiece from './pieces/ServicePiece.svelte';
  import UnknownPiece from './pieces/UnknownPiece.svelte';

  let {
    piece,
    glyph,
    inferred = false,
    animated = false,
  }: { piece: PieceName; glyph?: 'gear'; inferred?: boolean; animated?: boolean } = $props();

  const COMPONENTS = {
    frontend: FrontendPiece,
    datastore: DatastorePiece,
    queue: QueuePiece,
    payments: PaymentsPiece,
    globe: GlobePiece,
    job: JobPiece,
    module: ModulePiece,
    unknown: UnknownPiece,
    cache: CachePiece,
    'load-balancer': LoadBalancerPiece,
  } as const;
  // Every piece but the service (which also takes a glyph) shares the same props.
  const Drawing = $derived(COMPONENTS[piece as Exclude<PieceName, 'service'>] ?? UnknownPiece);
  // Animation is decorative: never when the operating system asks for reduced motion.
  const moving = $derived(animated && !prefersReducedMotion.current);
</script>

<g class="iso-piece" class:inferred data-piece={piece}>
  {#if piece === 'service'}
    <ServicePiece tone={PIECE_FILL.service} {moving} {...glyph ? { glyph } : {}} />
  {:else}
    <Drawing tone={PIECE_FILL[piece]} {moving} />
  {/if}
</g>
