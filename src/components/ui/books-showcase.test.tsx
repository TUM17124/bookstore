// @vitest-environment jsdom
/**
 * Tests for the ✕ "Not interested" button on GridBookCard.
 * Covers:
 *  - click isolation: ✕ calls onHide and stops the event from opening the book
 *  - aria-label includes the book title
 *  - ✕ not rendered when no onHide prop
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GridBookCard, RecommendedBooks, type BookCfg } from './books-showcase'
import { getRelatedBooks } from '@/lib/api'

// ------------------------------------------------------------------ mocks

vi.mock('@/lib/api', () => ({
  getRatings: vi.fn().mockResolvedValue({ count: 0, average: 0 }),
  sendAdEvent: vi.fn(),
  queueSignal: vi.fn(),
  currentPlacement: vi.fn().mockReturnValue(''),
  hideBook: vi.fn().mockResolvedValue(undefined),
  unhideBook: vi.fn().mockResolvedValue(undefined),
  getHideReasons: vi.fn().mockResolvedValue([]),
  searchTrack: vi.fn().mockResolvedValue(undefined),
  getRelatedBooks: vi.fn().mockResolvedValue([]),
  getBookAccess: vi.fn().mockResolvedValue({}),
  downloadBook: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/site-config', () => ({
  useSignalsOn: () => false,
  useFeature: () => false,
  useSiteConfig: () => [{}, true],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/bookmarks-context', () => ({
  useBookmarks: () => ({ isBookmarked: () => false, toggleBookmark: vi.fn() }),
}))

vi.mock('@/components/category-nav/use-scroll-edges', async () => {
  const actual = await vi.importActual<typeof import('@/components/category-nav/use-scroll-edges')>('@/components/category-nav/use-scroll-edges')
  return { ...actual, useScrollEdges: () => ({ start: true, end: true, update: vi.fn() }) }
})

// jsdom doesn't have IntersectionObserver
beforeEach(() => {
  if (!globalThis.IntersectionObserver) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (!globalThis.ResizeObserver) {
    ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

// ------------------------------------------------------------------ helpers

const BOOK: BookCfg = {
  id: '42',
  title: 'Test Book',
  author: 'Author Name',
  year: '2024',
  stars: 4,
  desc: '',
  isFree: true,
}

let root: Root | null = null
let el: HTMLDivElement | null = null

async function render(ui: React.ReactElement) {
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(ui))
}

afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
  el = null
})

function hideBtn() {
  return el!.querySelector('button[aria-label^="Not interested"]') as HTMLButtonElement | null
}

function cardBtn() {
  // The main book card button (open-book trigger)
  return el!.querySelector('button:not([aria-label^="Not interested"])') as HTMLButtonElement | null
}

// ------------------------------------------------------------------ tests

describe('GridBookCard ✕ button', () => {
  it('is not rendered when onHide is not provided', async () => {
    await render(<GridBookCard book={BOOK} onOpen={vi.fn()} />)
    expect(hideBtn()).toBeNull()
  })

  it('has aria-label "Not interested in <title>"', async () => {
    await render(<GridBookCard book={BOOK} onOpen={vi.fn()} onHide={vi.fn()} />)
    const btn = hideBtn()
    expect(btn).not.toBeNull()
    expect(btn!.getAttribute('aria-label')).toBe('Not interested in Test Book')
  })

  it('calls onHide with book id and title when clicked', async () => {
    const onHide = vi.fn()
    const onOpen = vi.fn()
    await render(<GridBookCard book={BOOK} onOpen={onOpen} onHide={onHide} />)
    await act(async () => hideBtn()!.click())
    expect(onHide).toHaveBeenCalledWith('42', 'Test Book')
  })

  it('does NOT call onOpen when ✕ is clicked (click isolation)', async () => {
    const onHide = vi.fn()
    const onOpen = vi.fn()
    await render(<GridBookCard book={BOOK} onOpen={onOpen} onHide={onHide} />)
    await act(async () => hideBtn()!.click())
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('clicking the card button calls onOpen', async () => {
    const onOpen = vi.fn()
    await render(<GridBookCard book={BOOK} onOpen={onOpen} />)
    await act(async () => cardBtn()!.click())
    expect(onOpen).toHaveBeenCalled()
  })

  it('is not rendered while spinning', async () => {
    await render(<GridBookCard book={BOOK} onOpen={vi.fn()} onHide={vi.fn()} spinning />)
    expect(hideBtn()).toBeNull()
  })

  it('shows normal-size brand-pink stars only when backend ratings exist', async () => {
    await render(<GridBookCard book={{ ...BOOK, ratingAvg: 4.5, ratingCount: 2 }} onOpen={vi.fn()} />)
    const rating = el!.querySelector('[aria-label="Rating 4.5 out of 5"]')
    expect(rating).not.toBeNull()
    const stars = Array.from(rating!.querySelectorAll("svg"))
    expect(stars).toHaveLength(5)
    expect(stars.every((star) => star.className.baseVal.includes("var(--brand-pink-text)"))).toBe(true)
    expect(stars.every((star) => /h-4\s+w-4/.test(star.className.baseVal))).toBe(true)
    expect(el!.textContent).toContain("2")
  })

  it('does not invent filled review stars for an unrated book', async () => {
    await render(<GridBookCard book={BOOK} onOpen={vi.fn()} />)
    expect(el!.querySelector('[aria-label^="Rating "]')).toBeNull()
    expect(el!.textContent).toContain("No ratings yet")
  })

  it('renders recommendation books in a large, touch-scrollable carousel and opens the selected book', async () => {
    vi.mocked(getRelatedBooks).mockResolvedValue([
      { id: 43, title: 'A Related Book With A Longer Title', author: 'Writer', year: '2025', rating_avg: 4.5, rating_count: 2, images: { front: '/cover.jpg' }, ebook_price: 450, hasEbook: true } as never,
      { id: 44, title: 'Second Related Book', author: 'Writer', year: '2024', rating_avg: null, rating_count: 0, images: { front: '/cover-2.jpg' } } as never,
    ])
    const onBookSelect = vi.fn()
    await render(<RecommendedBooks book={BOOK} onBookSelect={onBookSelect} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    const carousel = el!.querySelector('[aria-label="Related books"]')!
    expect(carousel.getAttribute('aria-roledescription')).toBe('carousel')
    expect(carousel.className).toContain('overflow-x-auto')
    expect(carousel.className).toContain('touch-pan-x')
    const card = carousel.firstElementChild as HTMLElement
    expect(card.className).toContain('w-[clamp(14rem,24vw,18rem)]')
    expect(card.querySelector('[class*="aspect-[2/2.85]"]')).not.toBeNull()
    expect(card.querySelector('img')?.className).toContain('object-contain')
    expect(card.querySelector('.line-clamp-2')?.className).toContain('text-[14px]')
    expect(el!.textContent).toContain('A Related Book With A Longer Title')
    expect(el!.querySelector('[aria-label^="Rating 4.5"]')).not.toBeNull()
    expect(el!.querySelector('[aria-label="Scroll recommendations right"]')).not.toBeNull()

    const scrollBy = vi.fn()
    Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 600 })
    Object.defineProperty(carousel, 'scrollBy', { configurable: true, value: scrollBy })
    const next = el!.querySelector<HTMLButtonElement>('[aria-label="Scroll recommendations right"]')!
    expect(next.disabled).toBe(false)
    await act(async () => next.click())
    expect(scrollBy).toHaveBeenCalledWith({ left: expect.closeTo(492), behavior: 'smooth' })

    const bookButton = Array.from(carousel.querySelectorAll('button')).find(button => button.textContent?.includes('A Related Book With A Longer Title'))!
    await act(async () => bookButton.click())
    expect(onBookSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '43', title: 'A Related Book With A Longer Title' }))
  })
})
