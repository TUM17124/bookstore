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

  it('keeps keyboard focus inside while open and restores the opening control on Escape', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Browse categories'
    document.body.appendChild(trigger)
    trigger.focus()

    act(() => openCategorySheet())
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    last.focus()
    act(() => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
    expect(document.activeElement).toBe(first)

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })
})
