// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategorySheet, openCategorySheet } from './category-sheet'

vi.mock('@/lib/categories', () => ({
  CategoryIcon: () => <span aria-hidden="true" />,
  categoryHref: (category: { slug: string }) => `/categories/${category.slug}/`,
  useCategories: () => ({ navbar: [{ slug: 'books', label: 'Books', children: [] }] }),
}))
vi.mock('./department-menu', () => ({ DepartmentMenu: () => null }))

describe('responsive category browser', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.style.overflow = ''
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(<CategorySheet activeSlug="" />))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.body.style.overflow = ''
  })

  it('opens a visible desktop-capable dialog, navigates to departments, and restores scrolling on close', () => {
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    act(() => openCategorySheet())

    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.className).not.toContain('lg:hidden')
    expect(document.body.style.overflow).toBe('hidden')
    expect(Array.from(dialog!.querySelectorAll('a')).some((link) => link.textContent === 'Books')).toBe(true)

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click())
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
