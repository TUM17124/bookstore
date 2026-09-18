'use client'

import type { FormFieldElement, FormFieldKind } from '@/lib/pdf-editor-types'

export function FormFieldPanel({
  element,
  onChange,
}: {
  element: FormFieldElement
  onChange: (patch: Partial<FormFieldElement>) => void
}) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Form field</h2>

      <label className="mt-3 block text-xs text-foreground/55">
        Field type
        <select
          value={element.fieldKind}
          onChange={(e) => onChange({ fieldKind: e.target.value as FormFieldKind })}
          className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
        >
          <option value="text" className="text-black">
            Text field
          </option>
          <option value="checkbox" className="text-black">
            Checkbox
          </option>
          <option value="dropdown" className="text-black">
            Dropdown
          </option>
        </select>
      </label>

      <label className="mt-3 block text-xs text-foreground/55">
        Field name
        <input
          type="text"
          value={element.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. full_name"
          className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
        />
      </label>

      {element.fieldKind === 'text' && (
        <label className="mt-3 block text-xs text-foreground/55">
          Default value
          <input
            type="text"
            value={element.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      )}

      {element.fieldKind === 'checkbox' && (
        <label className="mt-3 flex items-center gap-2 text-xs text-foreground/55">
          <input
            type="checkbox"
            checked={element.checked}
            onChange={(e) => onChange({ checked: e.target.checked })}
            className="h-4 w-4"
          />
          Checked by default
        </label>
      )}

      {element.fieldKind === 'dropdown' && (
        <>
          <label className="mt-3 block text-xs text-foreground/55">
            Options (comma-separated)
            <input
              type="text"
              value={element.options.join(', ')}
              onChange={(e) =>
                onChange({ options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })
              }
              placeholder="Option 1, Option 2"
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="mt-3 block text-xs text-foreground/55">
            Default selection
            <select
              value={element.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            >
              {element.options.map((o) => (
                <option key={o} value={o} className="text-black">
                  {o}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  )
}
