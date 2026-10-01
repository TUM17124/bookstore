"use client"

import { useCallback, useEffect, useState, type RefObject } from "react"

/**
 * For a horizontally scrolling row with a hidden scrollbar: whether there's
 * more content to the left / right, so the row can show a soft fade on that
 * edge only (and none at either end). Updated on scroll and on resize.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ start: false, end: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const next = { start: el.scrollLeft > 2, end: el.scrollLeft < max - 2 }
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [ref, update])

  return { ...edges, update }
}

/** CSS mask that fades only the edges that have more content. */
export function edgeMask(start: boolean, end: boolean): React.CSSProperties {
  if (!start && !end) return {}
  const left = start ? "transparent 0, #000 28px" : "#000 0"
  const right = end ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%"
  const mask = `linear-gradient(to right, ${left}, ${right})`
  return { maskImage: mask, WebkitMaskImage: mask }
}
