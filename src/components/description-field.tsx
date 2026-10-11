'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useLimits } from '@/lib/site-config'

/**
 * Description textarea with a live character counter. Over the Site-settings limit the form
 * cannot be saved, unless the text is the unchanged original (an old, longer description is
 * left alone until the author edits it). The server enforces the same rule.
 */
export function DescriptionField({
  name = 'description',
  defaultValue = '',
  original,
  rows = 4,
  placeholder = 'Short blurb',
  className,
}: {
  name?: string
  defaultValue?: string
  /** What is stored now. Resending it unchanged is always allowed. */
  original?: string
  rows?: number
  placeholder?: string
  className?: string
}) {
  const { book_description_max_chars: limit } = useLimits()
  const [value, setValue] = useState(defaultValue)
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const over = value.length > limit
  const unchanged = original !== undefined && value === original
  const blocked = over && !unchanged

  useEffect(() => {
    ref.current?.setCustomValidity(blocked ? `The description is too long (${value.length} of ${limit} characters). Shorten it to save.` : '')
  }, [blocked, value.length, limit])

  const fmt = (n: number) => n.toLocaleString('en-US')
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
      <textarea
        ref={ref}
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-describedby={`${id}-count`}
        aria-invalid={blocked || undefined}
        className={className ?? 'rounded-lg border border-foreground/15 bg-transparent px-3 py-2'}
      />
      <p
        id={`${id}-count`}
        role="status"
        aria-live="polite"
        className={`text-right text-xs tabular-nums ${blocked ? 'font-semibold text-red-600 dark:text-red-400' : 'text-foreground/55'}`}
      >
        {fmt(value.length)} / {fmt(limit)}
        {blocked ? ' · too long' : over ? ' · over the limit, kept as it is until you edit it' : ''}
      </p>
    </div>
  )
}
