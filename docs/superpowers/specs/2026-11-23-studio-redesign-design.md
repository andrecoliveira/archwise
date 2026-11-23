# Studio redesign: legible, evidence-first architecture

- Status: Approved by the owner on 2026-11-23 (option A for stored Compose properties)
- Date: 2026-11-23
- Owner decisions: chat sessions of 2026-11-23 (visual direction, mockup iterations, comprehension grilling)
- Glossary: [`CONTEXT.md`](../../../CONTEXT.md). User-facing words in this document follow it.
- Visual reference: [`assets/2026-11-23-studio-redesign-mockup.html`](assets/2026-11-23-studio-redesign-mockup.html). Open it in a browser. **Where the mockup and this document disagree, this document wins.** The mockup predates the comprehension decisions in §5; its known divergences are listed in §11.

## 1. Intent

The owner's verdict on today's Studio: "ugly, and hard to find your way". The people it serves are developers and architects trying to understand a system they did not build.

The redesign has two halves, and both are required:

1. **A visual identity** inspired by the interactive course at designed-to-scale.vercel.app: a three-column layout, isometric pieces per component type, one monospaced font, quiet animation, and light and dark themes. Archwise borrows the principles, not the identity. Palette, logo, illustrations and names are Archwise's own.
2. **Reading and comprehension.** Every claim on screen shows its confidence and its reasons in words a person can read. Nothing on screen asserts more than the evidence supports.

It ships before Phase 4 PR 2, so source analysis lands in a Studio that can already explain it.

## 2. Goals, non-goals, anti-goals

**Goals**

- Someone new to a codebase can answer three questions about any component without leaving the Studio: what is it, what does it relate to, and why does Archwise think so.
- Every **Inferred** claim is shown with its reasons, wherever "inferred" appears.
- One coherent look across Explore, Sandbox, sessions and every state (loading, empty, error, partial).
- Dark theme by default, plus a light theme.

**Non-goals (this redesign)**

- A revision timeline or revision browsing. It returns in Phases 6–7, built on real revision diffs (§5.12).
- "Open in editor", user notes, AI suggestions, user confirmations.
- New Sandbox or simulation behavior. Sandbox is restyled; what it does is unchanged.
- Step-by-step narrated walkthroughs ("lesson" mode). They belong to Phase 8 (simulator).
- Pieces for Kubernetes or other kinds that Phase 4 PR 3 introduces. That PR adds them in this style.

**Anti-goals: failure even if everything technically works**

- Any text that claims more than the evidence: invented purposes ("the main database"), invented verbs ("reads and writes data"), adjectives.
- Color as the only carrier of meaning, or one color carrying two meanings.
- Animation that encodes data, or that runs when the operating system asks for reduced motion.
- Any network request the user did not trigger. Fonts and assets ship with the app.
- Losing information density for the sake of looks. The All packages view stays dense.

## 3. Constraints

All invariants in `AGENTS.md` hold. In particular:

- **Local-first.**
  - No CDN fonts, no remote assets, no telemetry.
  - JetBrains Mono is bundled. It is licensed under SIL OFL 1.1.
- **Read-only.** Excerpts (§5.11) read files that the scan has already inventoried and never write.
- **Untrusted inputs.** Labels, paths and excerpts come from analyzed repositories. They are rendered as text, never as HTML.
- **Accessibility.**
  - Every canvas element and list item is keyboard-reachable and has an accessible name.
  - Confidence is encoded by line style and text, never by color alone.
  - Text and line contrast meet WCAG AA in both themes.
  - `prefers-reduced-motion: reduce` disables every animation.
- **Dependencies.** Only one new runtime dependency (§7). It must be pinned exactly, with the justification in the PR.
- **Docs.** They change in the same PR as the behavior they describe.

## 4. The visual system

### 4.1 Tokens and themes

All colors are CSS custom properties on `:root`. Components never use literal colors.

- **Themes.** Dark is the default; light is the alternative. The choice persists per browser, in `localStorage`, guarded so the page works without it.
- **Token families:**
  - surfaces: `--bg`, `--panel`, `--panel-2`, `--line`;
  - ink: `--ink`, `--ink-2`, `--ink-3`;
  - outlines and shadows: `--outline`, `--stroke`, `--shadow`;
  - `--accent`;
  - one fill per component kind;
  - `--plinth`, `--msg`.
- **Starting values.** Take them from the mockup. Exception: the **queue fill changes from amber to a terracotta orange**, so that amber means only selection (§5.10).
- **Font.** JetBrains Mono, weights 400, 500 and 700, Latin subset, served from the app bundle.

### 4.2 Layout

The layout has three columns plus a top bar, as in the mockup.

- **Top bar:**
  - logo;
  - workspace name;
  - revision chip: "rev N · scanned <relative time> · complete | partial", with the reason on hover or focus;
  - mode tabs: **Explore** and **Sandbox**, the existing modes;
  - search (⌘K and `/`);
  - node-style toggle;
  - theme toggle;
  - save status;
  - Sessions.
- **Left column, the component list:**
  - components grouped by kind, each group with its kind swatch and count;
  - the hidden-libraries row (§5.8);
  - the coverage-gaps box (§5.9).
- **Center:**
  - title, the counters (§5.9) and the **System | All packages** switch;
  - the canvas, which takes all the remaining height. There is no timeline under the canvas.
- **Right column, the inspector (§5.4).**
- **Collapsing.** The left and right columns can collapse. Below 1100 px wide they become drawers.

### 4.3 Isometric pieces

Every component kind has an isometric piece standing on its own plinth.

- **Drawing method.**
  - The projection is true 30° isometric.
  - Faces are lit from the left: light top, base-color left face, dark right face.
  - Corners are rounded.
  - Details are drawn on the faces through face transforms, as the mockup's drawing kit does.
- **Pieces in scope:**

| Kind | Piece |
|---|---|
| service | server cabinet: rack units with LEDs on the front, vents on the side, terminal glyph on top |
| frontend | open laptop showing a browser window |
| datastore | cylinder of stacked disks |
| queue | conveyor belt with rollers, carrying flat envelopes toward an arrow |
| external-system, category `payments` | card terminal with a card standing in its slot |
| external-system, any other category | globe on a stand |
| job | cube with a clock face *(new; not in the mockup)* |
| module (library) | box with a `{ }` glyph *(new; not in the mockup)* |
| unknown kind | plain box with a `?` glyph *(new)* |

- **Selection** lights the plinth outline in `--accent`. It never uses a halo or a fill change.
- **Inferred** pieces get a dashed outline on the piece only. The plinth stays solid.
- **Flat cards.** The node-style toggle switches between isometric pieces and flat cards. Defaults:
  - isometric in the System view;
  - flat in All packages;
  - flat when a view has more than 80 components.

  The user's choice wins and persists per view.

### 4.4 Animation

Animation is decorative: it signals that a part is alive, and it never encodes data.

- **queue:** envelopes travel along the belt in a continuous loop; slats and rollers move at matching speed.
- **service:** rack LEDs blink at different rhythms.
- **frontend:** a cursor blinks in the browser window.
- **payments terminal:** a progress bar fills, then the `$` appears.
- **datastore, globe, job, module:** static.
- **Focused relations:** a dot travels the line from the source boundary and stops before the arrowhead. The arrowhead itself is never covered.
- **Reduced motion:** nothing animates. Envelopes are drawn evenly spaced and static.

### 4.5 Canvas interaction

- **Selecting.** A click selects a component; Esc clears the selection.
- **Moving around.** Dragging the background pans. The wheel zooms around the cursor, between 25% and 300%. The +, − and Fit buttons do the same. Dragging a component moves it, and its relations follow.
- **Focus.** Selecting a component dims everything that is neither the selection nor its neighbors.
- **Keyboard.**
  - Tab moves through components in list order, and Enter selects.
  - Arrow keys pan.
  - `+` and `-` zoom.
  - `0` fits the view.
- **Layout.** ELK lays out the canvas, with node sizes taken from the piece dimensions. Positions the user drags are kept for the session view and are not written to the revision.

## 5. Comprehension rules

These were decided one by one with the owner on 2026-11-23. They are binding.

### 5.1 Words for confidence

The UI uses the domain's levels everywhere: canvas, list, inspector, legend and counters. Each level has a fixed meaning:

- **Observed:** a file states it.
- **Inferred:** Archwise deduced it, and the reasons are always shown.
- **Unknown:** Archwise found something but could not classify it.

The UI never says "Confirmed": that word is reserved for the future user attestation (Phase 6). "Deduced" is not used.

### 5.2 Every claim shows level and reasons

Every component and every relation is presented as its **level plus its reasons**, in the same place and the same format, whatever the level:

- Observed reads "Observed because: …", in a neutral tone.
- Inferred reads "Inferred because: …", with a dashed treatment and the note "No file states this directly. Check before relying on it."

### 5.3 Reasons are codes, read as sentences

Reason codes stay the stored data, for example `client-library:pg` and `compose-depends-on`. The Studio owns a **reason catalog** that turns each code into a sentence. The sentence names its parameter and, when one exists, the evidence file and line. Examples:

- "depends on **pg**, a PostgreSQL client library · apps/api/package.json"
- "compose.yaml starts it after **cache** · line 14"

Rules for the catalog:

- **The code stays visible.** It appears small and muted beside the sentence, for tracing and bug reports.
- **Completeness test.** A test enumerates every reason code the resolver and the analyzers can emit and fails if any code lacks a sentence.
- **Unknown codes.** A code the catalog does not know, for example one from an older revision, renders as the raw code. It never renders as an empty line.

### 5.4 Inspector structure

The inspector has the same fixed order for every component:

1. **Header,** text only:
   - the primary name (§5.6);
   - the kind with its swatch;
   - the summary line (§5.5).

   The header shows no piece illustration. Owner decision, 2026-11-23: the canvas already shows the piece, and the inspector is for reading.
2. **Confidence band:** level and readable reasons (§5.2, §5.3). This is the only place that explains why the component is of its kind.
3. **Tabs.** Switching component keeps the active tab.
   - **Details:** the component's properties. Each shows its source (`compose.yaml:16`) as a quiet suffix, and its full evidence on hover or focus. A property without evidence is not shown. Aliases appear here as "Also called", each with its source.
   - **Relations:** two groups, "Uses" and "Used by". Each row shows:
     - the other component's swatch, name and kind;
     - the relation wording (§5.7);
     - the relation's level and reasons.

     Activating a row selects that component.
   - **Evidence:** grouped by file. Each item shows the rule that read it and its line range, with **Copy `path:line`** and **Show lines** (§5.11).

When nothing is selected, the inspector says: "Select a component on the canvas or in the list to see what it is, what it relates to, and why."

### 5.5 The summary line states only claims

The summary line is built only from existing claims: kind, technology, where it runs, and relation counts. It has no adjectives and no purpose. Examples:

- "Service · fastify · runs in compose.yaml · uses 4 · used by 1"
- "PostgreSQL datastore · runs in compose.yaml · used by 2"
- "Queue · BullMQ · inferred · used by 2"

A component's **purpose** is out of scope. Later it may come from a user **Note** or an AI **Suggestion**. Each is labeled as such, and neither ever becomes Observed or Inferred.

### 5.6 Names

- **Primary name.** A component's primary name is its **package name** when it has one (`@shop/api`). Otherwise it is its Compose service name (`db`) or its technology name (`BullMQ`).
- **Second line.** Lists, canvas labels and the inspector header show technology and folder on a second line, for example "fastify · apps/api".
- **Aliases.** Other names, such as the Compose service name, are **Aliases**. They are shown under Details, and search matches them.

### 5.7 Relation wording

A relation's wording is its domain **kind**, never an interpretation:

| Kind | Wording |
|---|---|
| `depends-on` | depends on |
| `calls` | calls |
| `publishes` | publishes to |
| `consumes` | consumes from |
| `reads` | reads |
| `writes` | writes |
| `contains` | contains |
| `deploys-to` | deploys to |
| `exposes` | exposes |

Today every discovered relation is `depends-on`. The UI must not show other verbs until a resolver emits those kinds.

- **On the canvas,** the relation label is its wording. The line style carries its confidence.
- **Focus:** when a relation is in focus, its label expands to "wording · because <first reason sentence>". A relation is in focus when either end is selected.
- **In the inspector,** a relation's reasons are always shown.

### 5.8 Indirect relations

In the System view, a relation drawn across hidden libraries is an **Indirect relation**. This replaces today's lifted edge (`apps/web/src/system-view.ts`):

- **Reasons.** Its reasons are the **chain of steps**. Each step shows its own level and its readable reasons. For example:
  1. "@shop/api depends on @shop/db · Observed · apps/api/package.json"
  2. "@shop/db depends on PostgreSQL db · Inferred · depends on pg; Prisma datasource is postgresql"
- **Confidence.** Its confidence is the confidence of the **weakest step**. It is Observed only if every step is Observed. Lifting a relation never lowers its confidence by itself.
- **Evidence.** Its evidence is the union of the steps' evidence. This fixes the deferred minor "lifted edges carry only the last hop's evidence".
- **Canvas label.** The label reads "depends on · through @shop/db".
- **Hidden libraries.** The left column's "Libraries · N hidden" row is activatable. It lists the hidden libraries and offers to switch to All packages.

### 5.9 Counters are labeled and filter

The counters each state their unit and their confidence split:

- "7 components · 3 inferred"
- "8 relations · 5 inferred"
- "1 file not analyzed"

Each count is a filter:

- **"3 inferred"** shows only Inferred components at full strength, with their reasons visible in the list, and dims the rest.
- **"1 file not analyzed"** opens the coverage-gap list. Each gap shows its file and its reason, in words ("unsupported Compose variant file").

A filter is cleared by activating the counter again or by pressing Esc.

### 5.10 One visual dimension per meaning

| Question | Answered by | Never by |
|---|---|---|
| What is it? | the kind's fill color and piece | line style |
| How sure is Archwise? | line style: solid Observed, dashed Inferred, dotted Unknown, applied to pieces, relations and list markers; reasons in neutral ink, prefixed with the level word | color |
| What am I looking at? | `--accent` (amber): selection, focus, focused relations, the traveling dot, the active tab | anything else |

Filters (§5.9) dim the rest of the canvas. They add no color.

### 5.11 Evidence excerpts

Each evidence item offers two actions:

- **Copy `path:line`.**
- **Show lines:** a read-only excerpt of the cited range, served by the local server.

Excerpts are a new read path for file content, so they are bounded. The server returns an excerpt only when **all** of these hold:

- the path and range belong to an evidence item of the **current revision** of the current workspace. The server never takes an arbitrary path;
- the file is inside the scanned root, resolved without following symlinks out of it, and it is not on the discovery deny list (`.env`, keys, `.npmrc` and the rest);
- the range is at most 40 lines. A whole-file evidence with no range shows its first 40 lines;
- the file is still under the inventory's size limit and is valid UTF-8.

Before the excerpt is returned, values that look like secrets are masked. That covers connection URLs with credentials, and the values of keys named like `password`, `secret`, `token` or `key`. Excerpts are never cached, logged, stored in sessions or included in exports. A file that changed since the scan shows a "changed since scan" notice instead of lines.

This boundary, together with stored Compose properties (§12.2), gets ADR 0008. `docs/security.md` documents both.

### 5.12 No revision timeline yet

The bottom timeline is removed. The revision chip in the top bar (§4.2) carries only what is true today. The roadmap's Phases 6–7 gain a work item: a revision timeline whose labels come from real revision diffs and are never hand-written.

## 6. Model and analyzer changes

This redesign needs data the model does not carry today. Every change is additive. `archwise.graph` stays at v1, and the view graph stays at v2 with only optional fields added.

1. **External-system category.**
   - The analyzer catalog gains a `category` for each external-system entry: `payments`, `email`, `storage`, `auth`, `ai`, `monitoring` or `other`.
   - Stripe is `payments`.
   - The category flows to view-graph nodes as optional `category`. The Studio uses it to choose the piece and in the summary line ("payments API").
2. **Compose properties.**
   - The Compose analyzer emits these properties for each service, each with its line evidence:
     - `image`;
     - `build` context;
     - published `ports` (host and container numbers only);
     - `depends_on`.
   - It **never** emits `environment`, `env_file`, `command`, `entrypoint`, labels, secrets or configs.
   - Properties attach to the component the service resolves to, and appear under Details.
   - Values pass the same masking as excerpts.
3. **Indirect relations** (§5.8): the System view keeps each step's confidence, reasons and evidence instead of collapsing them.
4. **Excerpt endpoint:** `GET /api/v1/evidence/excerpt`, keyed by an evidence identifier of the current revision, never by a raw path. It obeys §5.11.

## 7. Dependencies

The redesign adds **one** runtime dependency to `@archwise/web`:

- **`@fontsource/jetbrains-mono`, pinned exactly,** to bundle the font locally.
- **Why the alternatives fail:**
  - loading from Google Fonts makes a network request on every launch;
  - vendoring font files by hand loses Renovate updates and the dependency review.

No other dependency is added. The isometric drawing kit, icons and animations are hand-written SVG; SMIL is acceptable, or CSS animation.

## 8. Screens in scope

- **Explore:** everything in §4–§5.
- **Sandbox:**
  - the new tokens, font, layout and panels;
  - the hypothetical components use the same pieces, in a distinct "proposed" treatment: a hatched plinth and a "Proposed" tag;
  - behavior is unchanged.
- **Sessions panel, scan summary, gap list and diagnostics:** restyled. Diagnostics move into the coverage-gap and counter surfaces where they apply.
- **Every state has a designed screen:**
  - loading;
  - error, with Retry;
  - empty project (no manifests): it points to Sandbox;
  - nothing recognized: All packages is shown;
  - partial scan: the chip says "partial" with its reason;
  - historical session: the "Architecture changed" notice, restyled.
- **Default mode.** The default mode becomes **Explore** when the scan found any component, and Sandbox otherwise. Today the Studio always opens in Sandbox.

## 9. Verification

Each of these is required:

- **Unit tests:**
  - reason catalog completeness (§5.3);
  - summary-line builder (§5.5);
  - relation wording (§5.7);
  - indirect-relation chain, confidence and evidence union (§5.8);
  - counters and filters (§5.9);
  - name selection (§5.6);
  - Compose property extraction and its exclusions (§6.2);
  - catalog categories (§6.1).
- **Server tests for excerpts:**
  - allowed evidence;
  - unknown evidence identifier;
  - path outside the root;
  - symlink escape;
  - denied file;
  - over-long range;
  - non-UTF-8 file;
  - changed file;
  - secret masking.
- **Browser smoke (`scripts/browser-smoke.mjs`), in real Chrome:**
  - clicking a component fills the inspector;
  - clicking a list item fills the inspector;
  - a relation row navigates to the other component;
  - pan, zoom and drag work;
  - every Inferred component shows reasons in the list, on the canvas label and in the inspector;
  - the traveling dot never reaches the arrowhead;
  - reduced motion leaves zero animation elements;
  - both themes render;
  - no console errors.
- **Accessibility:**
  - an axe-core check in the smoke, with no serious or critical violations, if axe can be loaded from the existing toolchain without a new dependency. Otherwise this becomes a documented manual check;
  - a keyboard-only walkthrough, documented in `docs/alpha-testing.md`.
- **Screenshots:** reviewed for both themes, at 1600 × 950 and at 1024 × 768.

## 10. Delivery slices

There are three PRs, in this order. Each one is independently shippable.

1. **Foundation:**
   - tokens, themes and the bundled font;
   - the three-column layout and top bar;
   - every existing screen restyled;
   - the mode tabs, with the Explore default;
   - flat cards on the canvas.
2. **Pieces and canvas:**
   - the isometric drawing kit and all the pieces;
   - plinth selection and the node-style toggle;
   - canvas interactions and keyboard;
   - animations and reduced motion.
3. **Comprehension:**
   - the reason catalog;
   - the inspector structure;
   - the summary line and names;
   - relation wording and indirect relations;
   - counters and filters;
   - catalog categories and Compose properties;
   - excerpts, with ADR 0008 and the security docs.

Each PR updates `docs/architecture.md`, `docs/discovery.md`, `docs/security.md`, `docs/alpha-testing.md`, `README.md` and the roadmap as its behavior requires.

## 11. Mockup divergences (this document wins)

The mockup was built before §5 was decided. These parts of it are wrong:

- It uses "Confirmed" and "Deduced". The correct words are Observed and Inferred (§5.1).
- Its Observed components show no reasons (§5.2).
- It has a prose "Why this is a service" block. That content moves into the confidence band (§5.4).
- Its summary lines claim purposes, such as "The main PostgreSQL database" (§5.5).
- Its relation verbs are invented: "reads and writes data", "publishes jobs", "consumes jobs" (§5.7).
- Its edge labels mix kinds and reasons (§5.7).
- It names components by their short names ("api", "web") instead of package names (§5.6).
- It shows a small piece illustration in the inspector header. The header is text only (§5.4).
- Its counters have no units and do not filter (§5.9).
- It uses amber for queues and for inferred text (§5.10).
- It shows a revision timeline (§5.12).
- Its Configuration lists values without evidence (§5.4, §6.2).
- It loads its font from Google Fonts (§3, §7).

## 12. Calls made by Claude (owner may overturn)

- **Mode names.** The modes keep their existing names, **Explore** and **Sandbox**. The mockup's "Discover / Compare / Simulate" tabs are dropped: comparison and simulation stay panels inside Sandbox.
- **Flat-card threshold.** Above 80 components, a view starts in flat cards.
- **New pieces.** Job, module and unknown pieces are designed now, even though Phase 4 PR 1 emits no jobs.
- **Category vocabulary.** The categories are `payments`, `email`, `storage`, `auth`, `ai`, `monitoring` and `other`. Only `payments` gets a dedicated piece now.
- **Excerpt limits.** At most 40 lines, keyed by evidence identifier, with the masking rules of §5.11.
- **Compose property allowlist,** in §6.2.
- **Font dependency:** `@fontsource/jetbrains-mono` instead of vendored files.
- **Three PRs,** in the order of §10.

### 12.1 Builder-check rulings (2026-11-23)

A fresh reader planned from this document and raised eight questions. Seven are settled here; one went to the owner (§12.2).

1. **Turning reasons into sentences.**
   - **Codes:** the resolver exports the closed list of reason-code families as a pure constant from `@archwise/application`, for example `client-library`, `framework-dependency`, `compose-depends-on` and `prisma-datasource`. The Studio's catalog imports it, so the completeness test compares the two lists.
   - **Parameters:** a sentence takes its parameter from the code (`client-library:pg` gives `pg`) and the technology it points at from the claim's own data. For a relation that is the target component's technology, so the Studio does not copy the analyzer catalog.
   - **Files:** the file for each reason comes from a fixed mapping in the catalog between code families and evidence rules (`kind`), unit-tested. A reason with no matching evidence shows no file.

   The data format does not change.
2. **Which revision excerpts read from.**
   - Excerpts work without the session store. The server gives each evidence item of its **latest scan** a deterministic identifier, a hash of root, path, rule and lines. The identifier lives in server memory only and is sent with the view graph.
   - In a historical session, Show lines is offered only for evidence whose identifier also exists in the latest scan. Any other evidence shows "Not available: this evidence is from an earlier scan."
3. *(owner, §12.2)*
4. **The revision chip** has no revision number. It shows "scanned <relative time> · complete | partial", taking the scan time from a new `scannedAt` field on `/api/v1/scan`. It adds "· not saved" when no revision was recorded (store off or disabled). The relative time updates every minute.
5. **Unknown is render-only for now.** The dotted style and the `?` piece are built and tested with fixtures, but the view-graph contract is not widened. Widening happens in the PR that first emits `unknown` or a new kind.
6. **Several chains through hidden libraries.** An indirect relation uses its **strongest** chain: the fewest Inferred steps, then the shortest. The inspector lists the other chains under "Also through …". Its confidence is that of the chain it uses.
7. **Sandbox pieces.**

   | Sandbox component | Piece |
   |---|---|
   | client | the frontend laptop |
   | app server | service |
   | worker | service with a gear glyph on top |
   | database | datastore |
   | queue | queue |
   | **cache** | **new:** a short cylinder with a lightning glyph, in a fill of its own |
   | **load balancer** | **new:** a low box whose top shows one arrow splitting into three |

8. **Diagnostics.** Today's coverage-gap box becomes **Scan notes**. It lists coverage gaps first (file and reason), then the remaining diagnostics in plain sentences: ambiguous names, unresolved dependencies, truncated scan, failed analyzers, repositories not scanned. The counter reads "1 file not analyzed · 2 notes". No diagnostic is lost when the old diagnostics panel goes.

### 12.2 Owner decision (2026-11-23)

- **Compose properties are stored.** The owner chose to store them (option A). The view graph, and so the session store and exports, carry the closed allowlist of §6.2 with secret masking applied: `image`, `build` context, published `ports` and `depends_on`.
  - **Never stored:** `environment`, `env_file`, `command`, `entrypoint`, labels, secrets and configs.
  - **The security statement changes.** `docs/security.md`'s "file contents never reach the graph, the store or the API" becomes: "The graph stores only this closed list of configuration values, masked. It never stores environment variables, commands or source content."
  - **Format.** `archwise.graph` v1 is unchanged; the values live in the view graph only.
  - **Rejected alternative:** reading properties live at request time. It would add another file-reading path and leave Details empty in resumed sessions.
  - **ADR.** ADR 0008 records this decision together with evidence excerpts (§5.11): both define what configuration and source content the Studio may show and keep.
