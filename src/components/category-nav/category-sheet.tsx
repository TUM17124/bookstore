"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { categoryHref, categoryIcon, useCategories } from "@/lib/categories"

/**
 * Phones: a bottom sheet listing every navbar category (with icons). Opened
 * from the "All" chip or the menu's "Browse categories"; closes on tap
 * outside, Esc, swipe down, or choosing a category. One instance is mounted
 * by the navbar; anything can open it with openCategorySheet().
 */

const OPEN_EVENT = "plugyard:open-category-sheet"

export function openCategorySheet() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function CategorySheet({ activeSlug }: { activeSlug: string }) {
  const { navbar } = useCategories()
  const [open, setOpen] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setDragY(0)
    returnFocus.current?.focus?.()
  }, [])

  useEffect(() => {
    const onOpen = () => {
      returnFocus.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, close])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] lg:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close categories"
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 motion-safe:animate-in motion-safe:fade-in"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="All categories"
        className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-background pb-[max(16px,env(safe-area-inset-bottom))] text-foreground shadow-2xl motion-safe:transition-transform motion-safe:duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
        onTouchStart={(e) => {
          if ((panelRef.current?.scrollTop ?? 0) > 0) return
          startY.current = e.touches[0].clientY
        }}
        onTouchMove={(e) => {
          if (startY.current == null) return
          setDragY(Math.max(0, e.touches[0].clientY - startY.current))
        }}
        onTouchEnd={() => {
          if (startY.current == null) return
          startY.current = null
          if (dragY > 80) close()
          else setDragY(0)
        }}
      >
        <div className="sticky top-0 z-10 bg-background px-4 pt-2">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-foreground/20" aria-hidden />
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-lg font-bold">Categories</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-foreground/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-2 px-4 pb-2">
          <li className="col-span-2">
            <Link
              href="/"
              onClick={close}
              aria-current={!activeSlug ? "page" : undefined}
              className={`flex min-h-[48px] items-center rounded-2xl border px-4 text-[15px] font-semibold ${
                !activeSlug ? "border-foreground bg-foreground/10" : "border-foreground/15"
              }`}
            >
              All books
            </Link>
          </li>
          {navbar.map((c) => {
            const Icon = categoryIcon(c.icon)
            const on = activeSlug.toLowerCase() === c.slug.toLowerCase()
            return (
              <li key={c.slug} className="min-w-0">
                <Link
                  href={categoryHref(c.slug)}
                  onClick={close}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[48px] items-center gap-2.5 rounded-2xl border px-3 text-[15px] font-semibold ${
                    on ? "border-foreground bg-foreground/10" : "border-foreground/15"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0 opacity-75" aria-hidden />
                  <span className="min-w-0 break-words leading-tight">{c.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
