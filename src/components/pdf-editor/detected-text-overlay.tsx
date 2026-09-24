'use client'

import type { DetectedTextRun } from '@/lib/pdf-editor-text-layer'

/** Invisible click targets over an uploaded PDF's own existing text runs —
 * hovering reveals a subtle highlight so the user can see what's editable
 * before clicking, matching Adobe/Sejda's Edit-PDF hover cue. Clicking one
 * hands off to startEditingDetectedRun in the editor page, which converts
 * it into a live, editable TextElement seeded with the detected content/
 * position/font. */
export function DetectedTextOverlay({
  runs,
  onEdit,
}: {
  runs: DetectedTextRun[]
  onEdit: (run: DetectedTextRun) => void
}) {
  return (
    <>
      {runs.map((r) => (
        <button
          key={r.id}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onEdit(r)}
          aria-label={`Edit text: ${r.text}`}
          title="Click to edit this text"
          className="absolute z-[5] cursor-text rounded-sm hover:bg-sky-400/25 hover:outline hover:outline-1 hover:outline-sky-500"
          style={{
            left: `${r.xf * 100}%`,
            top: `${r.yf * 100}%`,
            width: `${r.wf * 100}%`,
            height: `${r.hf * 100}%`,
          }}
        />
      ))}
    </>
  )
}


