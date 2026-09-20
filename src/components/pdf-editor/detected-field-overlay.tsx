'use client'

import type { DetectedField } from '@/lib/pdf-editor-forms'

/** Interactive inputs positioned directly over an uploaded PDF's own
 * (already-rendered) form field appearances, so the user can type/check/
 * select values in place. Values are baked into the page as flattened
 * content at export time — see pdf-editor-forms.ts. */
export function DetectedFieldOverlay({
  fields,
  onChange,
}: {
  fields: DetectedField[]
  onChange: (id: string, patch: Partial<DetectedField>) => void
}) {
  return (
    <>
      {fields.map((f) => (
        <div
          key={f.id}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-10"
          style={{
            left: `${f.xf * 100}%`,
            top: `${f.yf * 100}%`,
            width: `${f.wf * 100}%`,
            height: `${f.hf * 100}%`,
          }}
        >
          {f.kind === 'text' && (
            <input
              type="text"
              value={f.value}
              onChange={(e) => onChange(f.id, { value: e.target.value })}
              className="h-full w-full rounded border border-sky-500 bg-sky-50/90 px-1 text-[11px] text-black outline-none dark:bg-sky-950/70 dark:text-white"
            />
          )}
          {f.kind === 'checkbox' && (
            <input
              type="checkbox"
              checked={f.checked}
              onChange={(e) => onChange(f.id, { checked: e.target.checked })}
              className="h-full w-full accent-sky-500"
            />
          )}
          {(f.kind === 'dropdown' || f.kind === 'radio') && (
            <select
              value={f.value}
              onChange={(e) => onChange(f.id, { value: e.target.value })}
              className="h-full w-full rounded border border-sky-500 bg-sky-50/90 px-0.5 text-[11px] text-black outline-none dark:bg-sky-950/70 dark:text-white"
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </>
  )
}


