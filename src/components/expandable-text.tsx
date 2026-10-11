'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A description that shows a few lines and expands in place.
 * - Line breaks are kept (`whitespace-pre-line`); text is rendered as text, never as HTML.
 * - Long unbroken words and URLs wrap (`overflow-wrap: anywhere`), never overflow sideways.
 * - "Read more" appears only when the text really is cut off, measured before paint, so
 *   the page does not jump. Expanded text scrolls inside a bounded box instead of pushing the
 *   page around.
 */
export function ExpandableText({
  text,
  lines = 4,
  desktopLines,
  className,
  moreLabel = 'Read more',
  lessLabel = 'Show less',
}: {
  text: string
  /** Lines shown on phones and in cards. */
  lines?: number
  /** Lines shown from the `sm` breakpoint up (defaults to `lines`). */
  desktopLines?: number
  className?: string
  moreLabel?: string
  lessLabel?: string
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el || open) return
    setCut(el.scrollHeight > el.clientHeight + 1)
  }, [open])

  useLayoutEffect(measure, [measure, text, lines, desktopLines])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])
  // A new text starts collapsed.
  useEffect(() => setOpen(false), [text])

  const dl = desktopLines ?? lines
  return (
    <div className="min-w-0">
      <p
        ref={ref}
        id={id}
        data-expanded={open}
        style={open ? undefined : ({ ['--clamp' as string]: lines, ['--clamp-sm' as string]: dl } as React.CSSProperties)}
        className={cn(
          'm-0 min-w-0 whitespace-pre-line [overflow-wrap:anywhere] [word-break:break-word]',
          open
            ? 'max-h-[min(50vh,26rem)] overflow-y-auto overscroll-contain'
            : 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:var(--clamp)] sm:[-webkit-line-clamp:var(--clamp-sm)]',
          className,
        )}
      >
        {text}
      </p>
      {cut || open ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex min-h-[28px] items-center text-[13px] font-semibold text-[var(--brand-pink-text)] underline underline-offset-2"
        >
          {open ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  )
}
