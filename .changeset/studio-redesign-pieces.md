---
'@archwise/web': patch
---

Studio redesign, pieces and canvas:

- Components are drawn as isometric pieces on plinths, with a Pieces/Cards toggle remembered per view.
- Selecting a component lights its plinth and dims the rest; focused relations show a dot that stops before the arrowhead.
- The canvas has keyboard control: arrow keys pan, `+` and `-` zoom, `0` fits, and Enter selects.
- Proposed Sandbox components stand on hatched plinths with a Proposed tag.
- Nothing animates when the operating system asks for reduced motion.
