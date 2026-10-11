# The 3D book (books-showcase.tsx)

## Geometry: one set of dimensions
`src/lib/book3d/geometry.ts` is the single source for the boards, spine, page block and page leaves.
`buildBook` in `books-showcase.tsx` only turns those numbers into meshes, and `geometry.test.ts` checks them
for several page counts, closed and at several opening angles.

- Book space: the spine/board meeting plane is `x = 0`, the front cover faces `+z`.
- Boards are `CW × CH × CT` (1.46 × 2.24 × 0.032). The page block is inset by `SQ` (0.03, the "square" of a real
  hardcover) at the top, bottom and fore-edge, and sits between the boards' inner faces (`CLEAR` 1.5 mm).
- Each board hinges on the line where the spine meets it (`x = 0`, mid-thickness). The spine is flush with the boards'
  outer faces and only its outer face carries the spine artwork; its other faces use the cover colour.
- Page thickness comes from `pageCount` (`blockThickness`, log curve, 0.247 at 8 pages to 0.62 at 300+).
- Nothing else moves when the cover turns: no spine rotation, no block squeeze, no fanning pages.

Why it used to misalign (before this change): the block was `W - 0.015` wide inside boards `W + 0.05` wide (1.5 % of a
unit of overhang, 15 mm-equivalents less than the top/bottom), its depth (`0.72·T`) was off-centre by `0.06·T` so the
front board floated `0.2·T` off the pages, the page leaves were `W - 0.02` wide and fanned out as the cover turned, the
spine box was rotated by `0.16 × angle` and the block scaled in z while opening. See the PR for measurements.

## States
- The book rests **closed**. "Look inside" / Enter / dragging the cover's fore-edge opens it (`OPEN_ANGLE` 2.35 rad).
- Four leaves (eight pages) lie on the block. Page images are never loaded: the first pages come from the secure reader
  (`/reader/` manifest, then `/reader/pages/<n>/`, text only, at most 8) and are drawn on canvases
  (`src/lib/book3d/pages.ts`). Only fetched when the reader opens the book in 3D.
- No preview allowed (or any error): title page from metadata, blank paper, a "Preview not available" note.

## Controls
Drag: spin on both axes with inertia. Alt/Shift/Ctrl-drag or a two-finger twist: roll. Double-click/double-tap, the
"Reset view" button or `R`: back to the front. Arrow keys spin. `Enter`: open/close. `PageDown`/`PageUp` or the ‹ › buttons:
turn pages. Drag a page across to turn it (springs back if released early); a hard flick riffles several.
Reduced motion: simple rotation only (no lag, no riffle).

## Looking at it without a GPU
Chromium with software WebGL renders it: launch with `--use-angle=swiftshader --enable-unsafe-swiftshader`.
In dev builds `window.__book3d.view(yaw, pitch, roll)`, `.open(bool)`, `.turn(n)` pose the book for screenshots
(stripped from production builds).
