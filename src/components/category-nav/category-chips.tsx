"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { LayoutGrid } from "lucide-react"
import { categoryHref, categoryIcon, useCategories } from "@/lib/categories"
import { openCategorySheet } from "./category-sheet"
import { edgeMask, useScrollEdges } from "./use-scroll-edges"

/**
 * Phones: one row of category chips that swipe sideways (momentum +
 * scroll-snap, no visible scrollbar). A soft fade shows on whichever edge
 * has more chips. The first chip opens the full "All categories" sheet.
 * The active chip scrolls into view when a category page opens.
 * Tap targets are 44px tall.
 */
export function CategoryChips({ activeSlug }: { activeSlug: string }) {
  const { navbar } = useCategories()
  const rowRef = useRef<HTMLUListElement>(null)
  const { start, end, update } = useScrollEdges(rowRef)

  useEffect(() => {
    const row = rowRef.current
    if (!row || !activeSlug) return
    const chip = row.querySelector<HTMLElement>(`[data-slug="${CSS.escape(activeSlug.toLowerCase())}"]`)
    if (!chip) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" })
    const t = setTimeout(update, 350)
    return () => clearTimeout(t)
  }, [activeSlug, navbar.length, update])

  if (!navbar.length) return <div className="h-[44px]" aria-hidden />

  return (
    <nav aria-label="Categories" className="md:hidden">
      <ul
        ref={rowRef}
        className="flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={edgeMask(start, end)}
      >
        <li className="snap-start">
          <button
            type="button"
            onClick={openCategorySheet}
            aria-haspopup="dialog"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-current/20 px-3.5 text-[14px] font-semibold"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            All
          </button>
        </li>
        {navbar.map((c) => {
          const Icon = categoryIcon(c.icon)
          const on = activeSlug.toLowerCase() === c.slug.toLowerCase()
          return (
            <li key={c.slug} className="snap-start" data-slug={c.slug.toLowerCase()}>
              <Link
                href={categoryHref(c.slug)}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-[44px] max-w-[70vw] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-semibold motion-safe:transition-colors ${
                  on ? "border-current bg-current/10" : "border-current/20 opacity-80"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{c.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
