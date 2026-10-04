"use client"

import { useViewStore } from "@giga-pdf/editor"

/**
 * The page the reader is looking at, for the "Page X of Y" indicator and the
 * highlighted thumbnail.
 *
 * In the continuous scroller that is the page at the middle of the screen
 * (kept in the view store by the scroll handler), NOT the page the user last
 * clicked into - they scroll far past it. In single-page mode it is the
 * document's own current page. Always clamped to a real page.
 */
export function useFocusedPageIndex(isContinuous: boolean, documentPageIndex: number, pageCount: number): number {
  const scrolledTo = useViewStore((s) => s.currentPageIndex)
  const raw = isContinuous ? scrolledTo : documentPageIndex
  if (pageCount <= 0) return 0
  return Math.min(Math.max(0, raw), pageCount - 1)
}
