"use client"

import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { CategoryInfo } from "@/lib/api"
import { CategoryIcon, categoryHref } from "@/lib/categories"
import { cn } from "@/lib/utils"

/**
 * Desktop / tablet navbar categories — the "Priority + More" pattern.
 *
 * As many categories as fit on ONE line, in the admin's order; the rest go
 * into a "More ▾" menu. Widths are measured from an invisible copy of every
 * item, and re-measured on resize (ResizeObserver) — items move in and out
 * of More as the window changes. The bar stays invisible (its space
 * reserved) until the first measurement, so nothing jumps on load.
 *
 * Always in the bar: categories the admin pinned (pin_to_bar) and the
 * category being viewed. If the active one still can't fit, "More" is
 * highlighted and so is the item inside it.
 */

const GAP = 4 // px between items (gap-1); pills add px-1.5 each side, so labels sit 16px apart

function Item({ c, active, tabIndex }: { c: CategoryInfo; active: boolean; tabIndex?: number }) {
  return (
    <Link
      href={categoryHref(c.slug)}
      tabIndex={tabIndex}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 text-sm font-medium outline-none motion-safe:transition-colors",
        "focus-visible:ring-2 focus-visible:ring-foreground/30",
        active ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:text-foreground",
      )}
    >
      <CategoryIcon name={c.icon} className="h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100" />
      <span className="max-w-[16ch] truncate">{c.label}</span>
    </Link>
  )
}

export function CategoryBar({ categories, activeSlug }: { categories: CategoryInfo[]; activeSlug: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const moreMeasureRef = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState<Set<string> | null>(null)
  // Open for the category it was opened on: navigating closes it.
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === activeSlug
  const setOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) =>
      setOpenFor((prev) => ((typeof v === "function" ? v(prev === activeSlug) : v) ? activeSlug : null)),
    [activeSlug],
  )
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = activeSlug.toLowerCase()

  const compute = useCallback(() => {
    const wrap = wrapRef.current
    const measure = measureRef.current
    if (!wrap || !measure) return
    const avail = wrap.clientWidth
    const widths = new Map<string, number>()
    measure.querySelectorAll<HTMLElement>("[data-slug]").forEach((el) => {
      widths.set(el.dataset.slug!, el.getBoundingClientRect().width)
    })
    const moreW = (moreMeasureRef.current?.getBoundingClientRect().width ?? 80) + GAP
    const must = categories.filter((c) => c.pinned || c.slug.toLowerCase() === active)
    const rest = categories.filter((c) => !(c.pinned || c.slug.toLowerCase() === active))
    const shown = new Set<string>()
    let used = 0
    for (const c of must) {
      shown.add(c.slug)
      used += (widths.get(c.slug) ?? 0) + GAP
    }
    for (let i = 0; i < rest.length; i++) {
      const w = (widths.get(rest[i].slug) ?? 0) + GAP
      const othersLeft = rest.length - i - 1 > 0
      if (used + w + (othersLeft ? moreW : 0) <= avail) {
        shown.add(rest[i].slug)
        used += w
      } else {
        break
      }
    }
    setVisible((prev) => {
      if (prev && prev.size === shown.size && [...shown].every((s) => prev.has(s))) return prev
      return shown
    })
  }, [categories, active])

  useLayoutEffect(() => {
    compute()
  }, [compute])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(compute)
    })
    ro.observe(wrap)
    document.fonts?.ready.then(compute).catch(() => {})
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [compute])

  const inBar = useMemo(() => categories.filter((c) => visible?.has(c.slug)), [categories, visible])
  const inMore = useMemo(() => categories.filter((c) => visible && !visible.has(c.slug)), [categories, visible])
  const activeInMore = inMore.some((c) => c.slug.toLowerCase() === active)

  // Menu behaviour: outside click / Esc close; arrows move focus; focus
  // returns to the More button.
  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>("a") ?? [])
    items()[0]?.focus()
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !moreBtnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      if (e.key === "Escape") {
        setOpen(false)
        moreBtnRef.current?.focus()
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault()
        list[(i + 1) % list.length]?.focus()
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault()
        list[(i - 1 + list.length) % list.length]?.focus()
      } else if (e.key === "Home") {
        e.preventDefault()
        list[0]?.focus()
      } else if (e.key === "End") {
        e.preventDefault()
        list[list.length - 1]?.focus()
      } else if (e.key === "Tab") {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, setOpen])

  const cols = inMore.length > 12 ? "grid-cols-3" : inMore.length > 6 ? "grid-cols-2" : "grid-cols-1"

  return (
    <div ref={wrapRef} className="relative flex h-9 min-w-0 flex-1 items-center">
      {/* Invisible copy of every item, for measuring widths. */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex gap-1 whitespace-nowrap">
        {categories.map((c) => (
          <span key={c.slug} data-slug={c.slug}>
            <Item c={c} active={false} tabIndex={-1} />
          </span>
        ))}
        <button ref={moreMeasureRef} type="button" tabIndex={-1} className="inline-flex h-9 items-center gap-1 px-1.5 text-sm font-medium">
          More <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <nav
        aria-label="Categories"
        className={cn("flex min-w-0 items-center gap-1 motion-safe:transition-opacity", visible ? "opacity-100" : "invisible opacity-0")}
      >
        {inBar.map((c) => (
          <Item key={c.slug} c={c} active={c.slug.toLowerCase() === active} />
        ))}
        {inMore.length > 0 && (
          <div className="relative">
            <button
              ref={moreBtnRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 motion-safe:transition-colors",
                activeInMore || open ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:text-foreground",
              )}
            >
              More
              <ChevronDown className={cn("h-4 w-4 motion-safe:transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="More categories"
                className={cn(
                  "absolute right-0 top-[calc(100%+8px)] z-[70] grid max-h-[70vh] gap-1 overflow-y-auto rounded-2xl border border-foreground/10 bg-background p-2 shadow-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  cols,
                  inMore.length > 6 ? "w-[min(560px,90vw)]" : "w-64",
                )}
              >
                {inMore.map((c) => {
                  const on = c.slug.toLowerCase() === active
                  return (
                    <Link
                      key={c.slug}
                      href={categoryHref(c.slug)}
                      role="menuitem"
                      aria-current={on ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-none hover:bg-foreground/5 focus-visible:bg-foreground/10",
                        on && "bg-foreground/10",
                      )}
                    >
                      <CategoryIcon name={c.icon} className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="min-w-0 break-words leading-snug">{c.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  )
}
