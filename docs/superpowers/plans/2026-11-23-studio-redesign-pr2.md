# Studio Redesign PR 2 (Pieces and canvas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every component as an isometric piece on its own plinth, on the canvas the Studio already has. This PR adds:
- **Pieces and cards.** People switch between pieces and flat cards with a toggle. The choice persists for each view.
- **Selection and focus.** Selecting a component lights its plinth and dims everything not connected to it.
- **Focused relations** show a dot that travels along them and stops before the arrowhead.
- **Keyboard control of the canvas:** Tab, Enter, arrow keys, `+`, `-` and `0`.
- **Quiet animations,** switched off when the operating system asks for reduced motion.

**Architecture:**
- **Pure geometry.** `apps/web/src/iso/kit.ts` holds the projection, the rounded footprints, convex hulls, box and cylinder geometry, face transforms and the dot-stop fraction. It is unit-tested with numbers.
- **Svelte rendering.** Small Svelte components draw that geometry: `IsoBox`, `IsoCylinder`, `Face` and one component per piece. Pure mapping functions choose the piece for a node.
- **Canvas wiring.** The canvas renders discovered nodes with `IsoNode` or the existing card, depending on a pure `nodeStyleFor` decision. ELK gets node sizes that match each style. A custom `DiscoveredEdge` draws arrowheads, dashing and the dot. A pure `canvasKeyAction` maps keys to viewport actions.

**Tech Stack:** Svelte 5.57 (`prefersReducedMotion` from `svelte/motion`), `@xyflow/svelte` 1.7.1, ELK, SVG with SMIL animation, Vitest, `@testing-library/svelte`, and the Playwright smoke test. There are **no new dependencies**.

**Spec:** `docs/superpowers/specs/2026-11-23-studio-redesign-design.md`: §4.3 pieces, §4.4 animation, §4.5 canvas interaction, §5.10 one meaning per visual dimension, §8 Sandbox "proposed" treatment, §10 slice 2, and §12.1 point 7 for the Sandbox pieces. Glossary: `CONTEXT.md`. The visual reference is `docs/superpowers/specs/assets/2026-11-23-studio-redesign-mockup.html`: its drawing kit, piece designs and animations. The spec wins where they differ.

## Global Constraints

- **Pieces:**

  | Kind | Piece |
  |---|---|
  | service | server cabinet: three rack units with LEDs, side vents, terminal glyph on top |
  | frontend | open laptop with a browser window on the screen |
  | datastore | cylinder of stacked disks |
  | queue | conveyor belt with rollers, carrying flat envelopes toward an arrow |
  | external-system, `category: 'payments'` | card terminal with a card standing in its slot |
  | other external-system | globe on a stand |
  | job | cube with a clock face |
  | module | box with a `{ }` glyph |
  | unknown kind | plain box with a `?` glyph |

- **Sandbox pieces** (spec §12.1 point 7):

  | Sandbox preset | Piece |
  |---|---|
  | `client` | frontend |
  | `app-server` | service |
  | `worker` | service with a gear glyph on top |
  | `database` | datastore |
  | `queue` | queue |
  | `cache` | new: short cylinder with a lightning glyph, fill `--kind-cache` |
  | `load-balancer` | new: low box with one arrow splitting into three on top |

  Hypothetical pieces stand on a **hatched plinth** and carry a **"Proposed"** tag.
- **Projection:** true 30° isometric. A world point `(x, y, z)` maps to the screen point `(cos30·(x−y), sin30·(x+y) − z)`. Faces are lit from the left: the top mixes 72% of the colour with white, the left face is the colour, the right face mixes 66% of the colour with black. Corners are rounded.
- **Selection** lights the plinth outline in `--accent`. **Inferred** pieces get a dashed outline on the piece only; the plinth stays solid. Colour never encodes confidence (spec §5.10).
- **Node style:**
  - Defaults: **pieces** in the System view, **cards** in All packages and Sandbox, and **cards** whenever a view has more than **80** components.
  - The person's choice wins. It persists for each view in `localStorage` under the key `archwise.nodeStyle.<system|all|sandbox>`, and storage access is guarded.
- **Animation** is decorative and never encodes data:

  | Piece | Animation |
  |---|---|
  | queue | envelopes loop along the belt over 4 s; slats move and rollers turn with them |
  | service | LEDs blink at different rhythms |
  | frontend | a cursor blinks |
  | payments terminal | a bar fills, then `$` appears, in a 2.4 s cycle |
  | datastore, globe, job, module, cache, load balancer | static |

  - Focused relations show a dot that travels from the source boundary and **stops 22 px before the arrowhead**.
  - With `prefersReducedMotion.current` set, **no** animation elements are rendered. Envelopes then sit static and evenly spaced.
- **Canvas keys** apply when focus is on the canvas region or on a node, never in a text field:
  - **Tab** moves through components in list order, and **Enter** selects the focused one;
  - **arrow keys** pan by 80 px;
  - **`+`** and **`=`** zoom in by ×1.2, and **`-`** zooms out by ×1/1.2;
  - **`0`** fits the view.

  Arrow keys never move nodes.
- **Every component node has an accessible name:** `<label>, <kind>, <observed|inferred>`.
- **Colours** come from tokens only. Task 2 extends the guard to Svelte markup attributes (`fill=`, `stroke=`, `stop-color=`) and to `<script>` blocks, closing PR 1's deferred minor. New tokens:
  - `--kind-cache`;
  - `--piece-screen`, `--piece-chrome`, `--piece-led`, `--piece-led-2`, `--piece-chip`, `--piece-stripe`, `--piece-text`, `--piece-belt`, `--piece-slat`;
  - all defined in both themes.
- **Not in this PR** (PR 3):
  - relation wording on edge labels;
  - the reason catalog;
  - the inspector restructure;
  - catalog categories in the data.

  The payments piece is built and tested now, and is chosen only when a node carries `category: 'payments'`. No discovered node carries it until PR 3.
- **Commits** are conventional, use `git commit -s`, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run pnpm as `npx --yes pnpm@10.34.9`. Never run Prettier on `docs/`.

## Review Focus

1. **Reduced motion changes while the page is open.** Expected: animations stop or start without a reload, because `prefersReducedMotion` is reactive. Pinned in Task 2 as `pieces render no animation under reduced motion`; the smoke test covers it with a reduced-motion browser context.
2. **A large view.** A graph of 120 components must open in cards, and switching it to pieces must not freeze. Pinned in Task 3 as `more than 80 components defaults to cards`; animation is limited to the focused component's neighbourhood in Task 5.
3. **Typing in the search field, or in a Sandbox inspector input.** Arrow keys, `+`, `-` and `0` must not pan or zoom. Pinned in Task 6 as `keys typed in a field do nothing`.
4. **A long label on a piece.** The pill truncates with an ellipsis and keeps the full text in `title`. Pinned in Task 4 as `long labels truncate with a title`.
5. **Pieces in the light theme.** Outlines and the selection ring must stay visible on the light plinth. Pinned in Task 7: the smoke test takes light-theme screenshots, and Task 2 adds a token test requiring `--outline` against `--plinth` ≥ 3:1 (non-text contrast) in both themes.

---

### Task 1: Isometric geometry kit

**Files:**
- Create: `apps/web/src/iso/kit.ts`, `apps/web/src/iso/kit.test.ts`

**Interfaces:**
- Produces:
  - `export const C = Math.cos(Math.PI / 6), S = 0.5`
  - `export function project(x: number, y: number, z: number): [number, number]`
  - `export function roundedFootprint(x0: number, y0: number, w: number, d: number, r: number, z: number, steps = 6): [number, number][]`. Corner arcs are sampled every 15° and projected.
  - `export function hull(points: [number, number][]): [number, number][]`. Monotone chain, counter-clockwise, no duplicates.
  - `export function polygonPath(points: [number, number][]): string`. `M x y L … Z`, with numbers rounded to 2 decimals.
  - `export interface BoxGeometry { hull: string; top: string; frontEdge: string; gradient: { x1: number; x2: number; stop: number } }`
  - `export function boxGeometry(b: { x0: number; y0: number; z0: number; w: number; d: number; h: number; r: number }): BoxGeometry`. `stop` is the fraction across the hull's horizontal extent where the front corner `(x0+w, y0+d)` projects, clamped to [0.02, 0.98].
  - `export type FaceName = 'top' | 'left' | 'right'`
  - `export function faceMatrix(face: FaceName, b: { x0; y0; z0; w; d; h }): string`. Returns `matrix(a,b,c,d,e,f)`. The face matrices are:
    - top: `(C, S, −C, S, project(x0, y0, z0+h))`;
    - left: `(C, S, 0, 1, project(x0, y0+d, z0+h))`;
    - right: `(C, −S, 0, 1, project(x0+w, y0+d, z0+h))`.
  - `export interface CylinderGeometry { body: string; topCx: number; topCy: number; rx: number; ry: number; bands: string[] }`
  - `export function cylinderGeometry(c: { cx: number; cy: number; z0: number; r: number; h: number; bands: number }): CylinderGeometry`. `rx = r·√2·C`, `ry = r·√2·S`.
  - `export function dotStopFraction(length: number, head = 22, tail = 6): { from: number; to: number }`. Returns the path fractions between which the dot travels. It returns `{ from: 0, to: 0 }` when `length <= head + tail`.

- [ ] **Step 1: Write the failing tests** in `kit.test.ts`:

```ts
test('project maps the world axes to 30° isometric', () => {
  expect(project(10, 0, 0)).toEqual([expect.closeTo(8.66, 2), expect.closeTo(5, 2)]);
  expect(project(0, 10, 0)).toEqual([expect.closeTo(-8.66, 2), expect.closeTo(5, 2)]);
  expect(project(0, 0, 10)).toEqual([0, -10]);
});
test('hull of a square plus an inner point is the square', () => {
  expect(hull([[0,0],[2,0],[2,2],[0,2],[1,1]])).toHaveLength(4);
});
test('roundedFootprint samples every corner', () => {
  expect(roundedFootprint(0, 0, 100, 100, 10, 0)).toHaveLength(4 * 7);
});
test('box geometry puts the shading split where the front corner projects', () => {
  const box = boxGeometry({ x0: -50, y0: -50, z0: 0, w: 100, d: 100, h: 40, r: 0 });
  expect(box.gradient.stop).toBeCloseTo(0.5, 2); // a square box's front corner is centred
  expect(box.hull.startsWith('M')).toBe(true);
});
test('box gradient stop is clamped', () => {
  const box = boxGeometry({ x0: 0, y0: 0, z0: 0, w: 1000, d: 1, h: 1, r: 0 });
  expect(box.gradient.stop).toBeLessThanOrEqual(0.98);
});
test('face matrices anchor at the face origin', () => {
  expect(faceMatrix('top', { x0: 0, y0: 0, z0: 0, w: 10, d: 10, h: 5 })).toBe('matrix(0.87,0.5,-0.87,0.5,0,-5)');
});
test('cylinder ellipse axes follow the projection', () => {
  const c = cylinderGeometry({ cx: 0, cy: 0, z0: 0, r: 10, h: 20, bands: 3 });
  expect(c.rx).toBeCloseTo(12.25, 2);
  expect(c.ry).toBeCloseTo(7.07, 2);
  expect(c.bands).toHaveLength(2);
});
test('dotStopFraction stops before the arrowhead', () => {
  expect(dotStopFraction(200)).toEqual({ from: 0.03, to: 0.89 });
  expect(dotStopFraction(20)).toEqual({ from: 0, to: 0 });
});
```

- [ ] **Step 2: Run and watch them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/iso/kit.test.ts < /dev/null`
  Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement `kit.ts`** per the Interfaces block. The mockup's `roundedFootprint`, `hull`, `box` and `onFace` functions are the reference algorithm. Matrix numbers are rounded to 2 decimals.

- [ ] **Step 4: Run and watch them pass.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): isometric geometry kit`

### Task 2: Pieces, piece mapping, tokens and the stricter colour guard

**Files:**
- Create:
  - `apps/web/src/iso/IsoBox.svelte`, `apps/web/src/iso/IsoCylinder.svelte`, `apps/web/src/iso/Face.svelte`, `apps/web/src/iso/Plinth.svelte`
  - `apps/web/src/iso/pieces/{Service,Frontend,Datastore,Queue,Payments,Globe,Job,Module,Unknown,Cache,LoadBalancer}Piece.svelte`
  - `apps/web/src/iso/Piece.svelte`, `apps/web/src/iso/piece-map.ts`, `apps/web/src/iso/piece-map.test.ts`, `apps/web/src/iso/Piece.test.ts`
- Modify:
  - `apps/web/src/styles/tokens.css` (new tokens) and `apps/web/src/styles/tokens.test.ts`;
  - `apps/web/src/styles/no-literal-colors.test.ts`: also scan Svelte `<script>` string literals and the `fill=`, `stroke=` and `stop-color=` attributes;
  - `apps/web/src/ArchitectureCanvas.svelte`: delete both dead `labelStyle: 'fill:#e2e8f0;…'` lines.

**Interfaces:**
- Consumes: Task 1's kit.
- Produces:
  - `export type PieceName = 'service' | 'frontend' | 'datastore' | 'queue' | 'payments' | 'globe' | 'job' | 'module' | 'unknown' | 'cache' | 'load-balancer'`
  - `export function pieceForNode(node: { type: string; category?: string }): PieceName`. It maps:
    - `external-system` with `category === 'payments'` → `payments`;
    - any other `external-system` → `globe`;
    - an unknown type → `unknown`.
  - `export function pieceForPreset(preset: string): { piece: PieceName; glyph?: 'gear' }`. `worker` gives `{ piece: 'service', glyph: 'gear' }`, and an unknown preset gives `{ piece: 'unknown' }`.
  - `export const PIECE_FILL: Readonly<Record<PieceName, string>>`: `var(--kind-…)`. `payments` and `globe` use `--kind-external`, `cache` uses `--kind-cache`, `load-balancer` uses `--kind-service`, and `unknown` uses `--kind-module`.
  - `Piece.svelte`, with props `{ piece: PieceName; glyph?: 'gear'; inferred?: boolean; animated?: boolean }`. It renders `<g class="iso-piece" data-piece={piece} class:inferred>`. Animations render only when `animated && !prefersReducedMotion.current`.
  - `Plinth.svelte`, with props `{ selected?: boolean; proposed?: boolean }`. It renders the 128 × 128 × 12 plinth (r = 18), a `.selring` outline that is `--accent` when selected, and a hatched pattern fill when proposed.

- [ ] **Step 1: Write the failing tests.**
  - `piece-map.test.ts`: every row of both tables in Global Constraints, plus the unknown type and unknown preset fallbacks.
  - `Piece.test.ts`, with testing-library:
    - each `PieceName` renders a `g.iso-piece[data-piece=…]` containing at least one `path`;
    - `inferred` adds the `inferred` class;
    - `pieces render no animation under reduced motion`: mock `svelte/motion` so `prefersReducedMotion.current = true`, render the queue and service pieces with `animated`, and expect `container.querySelectorAll('animate, animateTransform, animateMotion').length === 0`;
    - with motion allowed, the queue renders 3 travelling envelopes, so there are more than 0 animation elements.
  - `tokens.test.ts`, for both themes:
    - every new token is defined;
    - `--outline` against `--plinth` has contrast ≥ 3;
    - `--on-fill` against `--kind-cache` has contrast ≥ 4.5.
  - `no-literal-colors.test.ts`: the extended guard must flag the two `labelStyle` literals before they are deleted.

- [ ] **Step 2: Run and watch them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/iso src/styles < /dev/null`
  Expected: FAIL. The modules are missing, the tokens are missing, and the guard lists `ArchitectureCanvas.svelte:167` and `:422`.

- [ ] **Step 3: Implement.**
  - The pieces follow the mockup's `SHAPES` designs, at the same dimensions, in world units. The plinth is 128 × 128 × 12 with r = 18, and the piece origin is the plinth centre.
  - Gradient and clip ids are unique per instance, from a module counter in `IsoBox`.
  - Every colour is `var(--token)` or `color-mix()` of tokens.
  - Starting token values for dark / light:

    | Token | Dark | Light |
    |---|---|---|
    | `--kind-cache` | `#e6c86e` | `#f1dea0` |
    | `--piece-screen` | `#10131a` | `#2a2e38` |
    | `--piece-chrome` | `#2a2f3b` | `#3a404e` |
    | `--piece-led` | `#8fe07a` | `#3d8a2f` |
    | `--piece-led-2` | `#e8b04b` | `#d9902a` |
    | `--piece-chip` | `#d9b45a` | `#b8932f` |
    | `--piece-stripe` | `#2a2e38` | `#2a2e38` |
    | `--piece-text` | `#4a5163` | `#9aa0ae` |
    | `--piece-belt` | `#2a2e38` | `#3a3f4b` |
    | `--piece-slat` | `#3b4150` | `#555b68` |

  - Delete the two dead `labelStyle` lines.

- [ ] **Step 4: Run the tests and the full web suite.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): isometric pieces for every component kind and Sandbox preset`

### Task 3: Node style choice and layout sizes

**Files:**
- Create: `apps/web/src/node-style.ts`, `apps/web/src/node-style.test.ts`
- Modify:
  - `apps/web/src/graph-layout.ts`: `layoutNodes(nodes, edges, size = { width: 200, height: 72 })`;
  - `apps/web/src/graph-layout.test.ts`;
  - `apps/web/src/StudioTopBar.svelte` and its test: a "Node style" group with **Pieces** and **Cards**, shown in both modes;
  - `apps/web/src/App.svelte`: owns `nodeStyle` and passes it to the top bar and the canvas.

**Interfaces:**
- Produces:
  - `export type NodeStyle = 'pieces' | 'cards'`
  - `export type StyleView = 'system' | 'all' | 'sandbox'`
  - `export const NODE_STYLE_LIMIT = 80`
  - `export function nodeStyleFor(view: StyleView, count: number, stored: NodeStyle | null): NodeStyle`. The stored choice wins. Otherwise it returns `cards` when `count > 80` or `view !== 'system'`, and `pieces` otherwise.
  - `export function readNodeStyle(storage: Pick<Storage,'getItem'> | null, view: StyleView): NodeStyle | null` and `writeNodeStyle(storage, view, style): void`, both guarded like `theme.ts`.
  - `export const NODE_SIZE: Readonly<Record<NodeStyle, { width: number; height: number }>> = { pieces: { width: 232, height: 220 }, cards: { width: 200, height: 72 } }`
  - `StudioTopBar` gains a bindable `nodeStyle: NodeStyle` prop and the "Node style" button group, using `aria-pressed`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('the System view defaults to pieces', () => expect(nodeStyleFor('system', 7, null)).toBe('pieces'));
test('All packages and Sandbox default to cards', () => { expect(nodeStyleFor('all', 7, null)).toBe('cards'); expect(nodeStyleFor('sandbox', 3, null)).toBe('cards'); });
test('more than 80 components defaults to cards', () => expect(nodeStyleFor('system', 81, null)).toBe('cards'));
test('the stored choice wins', () => expect(nodeStyleFor('system', 500, 'pieces')).toBe('pieces'));
test('storage errors are swallowed', /* readNodeStyle with a throwing getItem → null; writeNodeStyle with a throwing setItem → no throw */);
test('readNodeStyle ignores unknown values', /* 'isometric' → null */);
```

  - In `graph-layout.test.ts`: `pieces spacing uses the pieces size`. Laying out three nodes with `NODE_SIZE.pieces` must keep every pair at least 45 px apart, measured with 232 × 220 boxes.
  - In `StudioTopBar.test.ts`: `node style buttons switch and expose pressed state`.

- [ ] **Step 2: Run and watch them fail.** Expected: FAIL.

- [ ] **Step 3: Implement.** `App` derives `styleView` from `studioMode` and `graphView`. It reads the stored choice when the view changes, and writes it when the person toggles.

- [ ] **Step 4: Run the web suite.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): choose pieces or cards per view, with matching layout sizes`

### Task 4: Piece nodes on the canvas

**Files:**
- Create: `apps/web/src/IsoNode.svelte`, `apps/web/src/IsoNode.test.ts`
- Modify:
  - `apps/web/src/ArchitectureCanvas.svelte`: node `type` is `iso` or `discovered` according to the `nodeStyle` prop. Sandbox nodes use `isoProposed` in pieces mode and `architecture` in cards mode. Every node gets `ariaLabel`. Layout uses `NODE_SIZE[nodeStyle]`.
  - `apps/web/src/studio.css`.

**Interfaces:**
- Consumes: `Piece`, `Plinth` and `pieceForNode` / `pieceForPreset` (Task 2); `NodeStyle` and `NODE_SIZE` (Task 3).
- Produces:
  - **`IsoNode.svelte`.** Props: `{ data: { node: GraphNode; animated?: boolean; dimmed?: boolean }; selected?: boolean }`. It renders:
    - a 232 × 220 SVG with the `Plinth` and the `Piece`;
    - a label pill under the plinth: the label (bold, with `title`) on the first line, and the kind plus technology on the second, followed by " · inferred" when inferred;
    - target and source handles at mid-height, left and right, with `isConnectable={false}`.
  - **`IsoProposedNode`.** Implemented as a `proposed` prop on `IsoNode` plus Sandbox data (`label`, `preset`, `status`, `utilization`). It uses `Plinth proposed`, adds a "Proposed" tag to the pill, keeps the Sandbox status line ("Modeled use: N%", "Bottleneck…", "Failed (modeled)"), and keeps connectable handles with the existing aria labels.
  - **Accessible name:** `ariaLabel` = `${label}, ${kindLabel}, ${confidence}` for discovered nodes, and `${label}, ${presetName}, proposed` for Sandbox nodes.

- [ ] **Step 1: Write the failing tests** in `IsoNode.test.ts`, mocking `@xyflow/svelte` `Handle` as in `DiscoveredNode.test.ts`:
  - `renders the piece for its kind`: `data-piece="datastore"` for a datastore node;
  - `selected lights the plinth`: the `.selring` element has the `selected` class;
  - `inferred dashes the piece and says inferred`;
  - `long labels truncate with a title`: an 80-character label keeps its full text in `title`;
  - `proposed nodes show the hatched plinth and the Proposed tag`.

- [ ] **Step 2: Run and watch them fail.** Expected: FAIL.

- [ ] **Step 3: Implement**, including the CSS:
  - the pill uses `--panel` and `--outline`, with an ellipsis;
  - `.selring.selected` uses a 3px `--accent` stroke;
  - `.iso-piece.inferred .face` uses `stroke-dasharray: 5 4`.

- [ ] **Step 4: Run the web suite, then the smoke.**
  Run: `npx --yes pnpm@10.34.9 build && ARCHWISE_BROWSER_CHANNEL=chrome ARCHWISE_PLAYWRIGHT_ENTRY=<playwright entry> node scripts/browser-smoke.mjs`
  Expected: PASS. The existing checks still hold: the System view labels appear inside `.svelte-flow__node`, and every node is inside the pane after layout.

- [ ] **Step 5: Commit.**
  `feat(web): isometric piece nodes in Explore and Sandbox`

### Task 5: Focus, dimming and relations with a travelling dot

**Files:**
- Create:
  - `apps/web/src/focus.ts`, `apps/web/src/focus.test.ts`
  - `apps/web/src/DiscoveredEdge.svelte`, `apps/web/src/DiscoveredEdge.test.ts`
- Modify:
  - `apps/web/src/ArchitectureCanvas.svelte`: discovered edges use type `discovered`. Node and edge data carry `dimmed`, and edges carry `focused`. Node `animated` is true only for the selected node and its neighbours when a component is selected, and for all nodes when none is.
  - `apps/web/src/studio.css`.

**Interfaces:**
- Produces:
  - `export function focusSet(edges: readonly { source: string; target: string }[], selected: string | null): { nodes: Set<string>; edges: Set<string> } | null`. Returns `null` when nothing is selected. Otherwise it returns the selected node, its direct neighbours, and the ids of the edges between them, as `source->target`.
  - **`DiscoveredEdge.svelte`.** Props are `EdgeProps` with `data: { confidence: 'observed'|'inferred'; focused?: boolean; dimmed?: boolean; animated?: boolean }`. It draws:
    - a smoothstep path with an arrowhead marker whose fill is `--ink-2`, or `--accent` when focused;
    - dashes (`6 5`) when inferred;
    - opacity 0.25 when dimmed;
    - when `focused && animated && !prefersReducedMotion.current`, a dot (r = 5, fill `--accent`) whose `animateMotion` has `keyPoints="from;to"` from `dotStopFraction(path.getTotalLength())` and `keyTimes="0;1"`, `calcMode="linear"`, `dur="1.8s"`.

- [ ] **Step 1: Write the failing tests:**
  - `focus.test.ts`:
    - nothing selected gives `null`;
    - selecting `api` in the system fixture's edge list gives `api`, its neighbours and only their edges;
    - an isolated node gives only itself.
  - `DiscoveredEdge.test.ts`, rendering inside a stub `svg`:
    - inferred edges carry `stroke-dasharray`;
    - a focused edge has the accent marker;
    - under reduced motion a focused edge renders no `animateMotion`;
    - `keyPoints` never reaches 1.

    jsdom has no `getTotalLength`; stub it on `SVGElement.prototype` to return 200 and expect `keyPoints="0.03;0.89"`.

- [ ] **Step 2: Run and watch them fail.** Expected: FAIL.

- [ ] **Step 3: Implement.** Dimming applies through a `.dimmed` class with opacity 0.35 on nodes, the same rule in both node styles.

- [ ] **Step 4: Run the web suite.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): focus dims the rest; focused relations show a travelling dot`

### Task 6: Canvas keyboard

**Files:**
- Create: `apps/web/src/canvas-keys.ts`, `apps/web/src/canvas-keys.test.ts`, `apps/web/src/CanvasKeys.svelte` (rendered inside `SvelteFlow`, so it can use `useSvelteFlow`)
- Modify: `apps/web/src/ArchitectureCanvas.svelte`. The viewport `div` gets `tabindex="0"`, and the existing `role="region"` and `aria-label` stay. It listens to `keydown` in the capture phase and passes events to `CanvasKeys`.

**Interfaces:**
- Produces:
  - `export type CanvasKeyAction = { pan: [number, number] } | { zoom: 'in' | 'out' } | { fit: true } | { select: string } | null`
  - `export function canvasKeyAction(event: Pick<KeyboardEvent,'key'|'target'|'metaKey'|'ctrlKey'|'altKey'>): CanvasKeyAction`. It returns:
    - `null` for text fields (input, textarea, select, contenteditable) and when a modifier is held;
    - for the arrow keys: Left `[80,0]`, Right `[-80,0]`, Up `[0,80]`, Down `[0,-80]`;
    - for `+` and `=`: zoom in;
    - for `-`: zoom out;
    - for `0`: fit;
    - for Enter on an element inside `.svelte-flow__node[data-id]`: `{ select: <data-id> }`.
  - **`CanvasKeys.svelte`.** It applies an action through `useSvelteFlow()`:
    - pan uses `setViewport` (x and y plus the delta, with zoom unchanged);
    - zoom uses `zoomIn` / `zoomOut`, with duration 0;
    - fit uses `fitView`;
    - select calls an `onSelect(id)` prop.

    When it handles an arrow key it calls `preventDefault` and `stopPropagation`, so Svelte Flow never moves a node.

- [ ] **Step 1: Write the failing tests** in `canvas-keys.test.ts`:
  - every key mapping above;
  - `keys typed in a field do nothing`: the input, textarea, select and contenteditable targets each give `null`;
  - a modifier gives `null` (Cmd+0, the browser's reset zoom, is left to the browser);
  - Enter outside a node gives `null`.

- [ ] **Step 2: Run and watch them fail.** Expected: FAIL.

- [ ] **Step 3: Implement**, and wire `onSelect` to set `selectedId`.

- [ ] **Step 4: Run the web suite.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): canvas keyboard — pan, zoom, fit and select`

### Task 7: Smoke, screenshots, docs and glossary

**Files:**
- Modify: `scripts/browser-smoke.mjs`, `docs/alpha-testing.md`, `docs/architecture.md`, `docs/implementation-roadmap.md` (redesign 2 of 3), `README.md` (if the Studio description changes), `apps/web/README.md`, `CONTEXT.md`
- Create: `.changeset/studio-redesign-pieces.md` (patch, `@archwise/web`)

`CONTEXT.md` gains two entries under Studio:
- **Piece:** the isometric drawing of a component's kind.
- **Card:** the flat rectangle form.
- Both list `_Avoid_: icon, tile, block`.

- [ ] **Step 1: Add the smoke checks** to the System phase and the Sandbox phase:
  1. **System view in pieces.** It opens in pieces, with at least 7 `.iso-piece` elements. Every node is still inside the pane after layout (the existing check).
  2. **Toggle and persistence.** Clicking **Cards** gives 0 `.iso-piece`, and a reload keeps cards. Clicking **Pieces** restores them.
  3. **All packages.** It opens in cards.
  4. **Focus.** Selecting `@shop/api` gives the `.dimmed` class to nodes that are neither it nor its neighbours. The travelling dot is present on its relations, and over 2 s of samples its centre never comes within 17 px (the arrowhead's length) of the edge's end point.
  5. **Keyboard.**
     - Tab into the canvas region; pressing `+` raises the viewport scale.
     - Pressing `0` fits, so every node is inside the pane again.
     - Pressing ArrowLeft changes the viewport x and leaves node positions unchanged.
     - Focus a node with Tab and press Enter: the inspector shows that component.
  6. **Sandbox.** With pieces chosen, proposed nodes show a "Proposed" tag and a hatched plinth. Dragging still works (the existing drag check).
  7. **Reduced motion.** A browser context with `reducedMotion: 'reduce'` has 0 `animate, animateTransform, animateMotion` elements.
  8. **Screenshots:** pieces in dark and light at 1600 × 950, plus the Sandbox in pieces.

  Run the smoke. Expected: FAIL on the checks that depend on the steps above, until Tasks 1–6 are in place. Since those tasks come first, prove the new checks by mutation, the same way PR 1 did. Expected after Tasks 1–6: PASS.

- [ ] **Step 2: Docs.**
  - `alpha-testing.md`: the pieces and cards toggle, focus dimming, the keyboard keys, and reduced motion.
  - `architecture.md`: the piece system, the node-style defaults, and the fact that animations are decorative.
  - Roadmap: redesign 2 of 3.
  - The web README.
  - Every statement describes delivered behaviour only.

- [ ] **Step 3: Full verification.**
  Run: `npx --yes pnpm@10.34.9 check < /dev/null` and the smoke.
  Expected: everything passes, and the screenshots are reviewed.

- [ ] **Step 4: Commit.**
  `docs: isometric pieces, canvas keyboard and focus; smoke coverage`
