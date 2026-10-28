// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BooksDepartment from './page-client'

vi.mock('@/components/offers/banners', () => ({
  Banners: ({ placement, category }: { placement: string; category?: string }) => <div data-testid="banners" data-placement={placement} data-category={category} />,
}))

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: nav.back }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }))
vi.mock('@/lib/categories', () => ({ useCategories: () => ({ all: [{ slug: 'books', label: 'Books', viewer_mode: 'book_3d' }] }) }))
vi.mock('@/lib/api', () => ({
  asBookList: (data: { results: unknown[] }) => data.results,
  getBook: vi.fn().mockResolvedValue({ id: 42, title: 'Test Title', author: 'Test Author', status: 'published' }),
  getHomeSections: vi.fn().mockResolvedValue({ sections: [] }),
}))
vi.mock('@/components/books-department-legacy', () => ({ toCfg: (book: { id: number }) => ({ ...book, id: String(book.id) }) }))
vi.mock('@/components/ui/books-showcase', () => ({
  BooksShowcase: ({ documentFlow, openBookId }: { documentFlow: boolean; openBookId?: string }) => (
    <div data-testid="showcase" data-document-flow={String(documentFlow)}>{openBookId ? `Selected book ${openBookId}` : 'Book catalogue'}</div>
  ),
  RecommendedBooks: ({ book }: { book: { title: string } }) => <section data-testid="recommendations">Recommendations for {book.title}</section>,
}))

let root: Root | null = null
let host: HTMLDivElement | null = null
async function render() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<BooksDepartment />))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  nav.push.mockClear(); nav.replace.mockClear(); nav.back.mockClear()
  nav.params = new URLSearchParams('book=42&category=fiction&view=read')
})
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

describe('Books detail route separation', () => {
  it('keeps department controls out of a deep-linked book detail and uses document flow', async () => {
    await render()
    expect(host!.textContent).toContain('Selected book 42')
    expect(host!.querySelector('[data-testid="showcase"]')?.getAttribute('data-document-flow')).toBe('true')
    expect(host!.querySelector('nav[aria-label="Browse by genre"]')).toBeNull()
    expect(host!.textContent).not.toContain('Browse by format')
    expect(host!.textContent).not.toContain('Search books or authors')
    expect(host!.textContent).not.toContain('Back to Books')
    expect(host!.querySelector('[data-testid="recommendations"]')?.textContent).toContain('Test Title')
    expect(host!.querySelector('[data-testid="banners"]')?.getAttribute('data-placement')).toBe('book')
    expect(host!.querySelector('[data-testid="showcase"]')?.nextElementSibling?.getAttribute('id')).toBe('recommended-books')
  })
})
