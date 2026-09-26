/**
 * text-box-controls.ts
 *
 * Canva/Figma/Google-Slides-style resize handles for a plain "text" element's
 * Fabric Textbox: only the two SIDE handles (ml/mr) are shown.
 *
 * Fabric's own Textbox class already binds ml/mr to a width-only resize (its
 * built-in `changeWidth` action handler sets `width` directly and keeps
 * `scaleX` at 1 — the text rewraps, nothing stretches) instead of the
 * generic corner/top-bottom handles it inherits from FabricObject, which
 * scale via scaleX/scaleY and visibly distort the rendered glyphs. Those are
 * hidden outright here rather than repurposed into a "scale font size"
 * control: doing that properly means recomputing fontSize, resetting scale
 * to 1 and re-wrapping on every drag tick — a second resize system to keep
 * in sync with the margin clamp, for a control the side handles already
 * cover (narrower/wider). Top/bottom are hidden too since a Textbox's height
 * is derived from its content — dragging them would fight the box's own
 * automatic re-wrap on every frame.
 *
 * Handle SIZE is intentionally the same constant at every zoom level, not a
 * per-device tweak: Fabric computes each control's on-screen hit box via
 * `calcOCoords()`, which cancels the canvas's own viewport zoom out of the
 * matrix before applying `cornerSize`/`touchCornerSize` — controls are drawn
 * and hit-tested in constant SCREEN pixels by design, already independent of
 * zoom. `TEXTBOX_TOUCH_CORNER_SIZE` (44) matches the platform-recommended
 * minimum touch target; `TEXTBOX_CORNER_SIZE` is a bit larger than Fabric's
 * own default (13) since only two handles remain, so each can afford to be
 * bigger without crowding the box.
 */

import type { FabricObject } from "fabric";

export const TEXTBOX_CORNER_SIZE = 16;
export const TEXTBOX_TOUCH_CORNER_SIZE = 44;
export const TEXTBOX_CONTROL_PADDING = 8;

/** Constructor-time options carrying the same constants — spread into a
 * `new Textbox(...)` call's options object so the FIRST paint already has
 * them (avoids a one-frame flash of Fabric's defaults before a follow-up
 * `.set()`). */
export const TEXTBOX_CONTROL_SIZE_OPTIONS = {
  cornerSize: TEXTBOX_CORNER_SIZE,
  touchCornerSize: TEXTBOX_TOUCH_CORNER_SIZE,
  padding: TEXTBOX_CONTROL_PADDING,
} as const;

/**
 * Applies the side-handles-only control configuration to a plain text
 * Textbox. Idempotent — safe to call on every (re)render of the same
 * object, which is how a text box actually gets its controls today: Fabric
 * objects are removed and reconstructed from the model on every edit and
 * reload (see render-elements.ts), so a per-construction-site option alone
 * would only cover the FIRST paint.
 */
export function applyTextBoxControls(obj: FabricObject): void {
  obj.set(TEXTBOX_CONTROL_SIZE_OPTIONS);
  obj.setControlsVisibility({
    tl: false,
    tr: false,
    bl: false,
    br: false,
    mt: false,
    mb: false,
    ml: true,
    mr: true,
    mtr: true,
  });
}
