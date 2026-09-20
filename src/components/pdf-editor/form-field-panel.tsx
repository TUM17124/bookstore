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
    <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
      <select
        value={element.fieldKind}
        onChange={(e) => onChange({ fieldKind: e.target.value as FormFieldKind })}
        aria-label="Field type"
        className="h-8 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
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

      <input
        type="text"
        value={element.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Field name (e.g. full_name)"
        aria-label="Field name"
        className="h-8 w-40 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
      />

      {element.fieldKind === 'text' && (
        <input
          type="text"
          value={element.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Default value"
          aria-label="Default value"
          className="h-8 w-40 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
        />
      )}

      {element.fieldKind === 'checkbox' && (
        <label className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-foreground/15 px-2 text-sm text-foreground/70">
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
          <input
            type="text"
            value={element.options.join(', ')}
            onChange={(e) =>
              onChange({ options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })
            }
            placeholder="Options (comma-separated)"
            aria-label="Options"
            className="h-8 w-52 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
          />
          <select
            value={element.value}
            onChange={(e) => onChange({ value: e.target.value })}
            aria-label="Default selection"
            className="h-8 shrink-0 rounded-lg border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
          >
            {element.options.map((o) => (
              <option key={o} value={o} className="text-black">
                {o}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}


