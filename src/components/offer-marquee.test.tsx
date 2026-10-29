// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OfferMarquee } from './offer-marquee'

const state = vi.hoisted(() => ({ path: '/', query: new URLSearchParams(), fetch: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useSearchParams: () => state.query }))
vi.mock('@/lib/auth-fetch', () => ({ authFetch: state.fetch }))
vi.mock('@/lib/site-config', () => ({ useSiteConfig: () => [{ site: { name: 'PlugYard' } }] }))
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.path = '/'; state.query = new URLSearchParams(); state.fetch.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const response = (text: string) => ({ ok: true, json: async () => ({ items: [{ id: 1, text, url: '', ends_at: null }] }) })

it('removes the old audience immediately while reselecting after logout', async () => {
  state.fetch.mockResolvedValueOnce(response('Members only'))
  await act(async () => root.render(<OfferMarquee />))
  expect(host.textContent).toContain('Members only')
  state.fetch.mockReturnValueOnce(new Promise(() => {}))
  await act(async () => window.dispatchEvent(new Event('auth-changed')))
  expect(host.textContent).not.toContain('Members only')
  expect(state.fetch).toHaveBeenCalledTimes(2)
})

it('does not carry home announcements into a different category while loading', async () => {
  state.fetch.mockResolvedValueOnce(response('Home only'))
  await act(async () => root.render(<OfferMarquee />))
  state.path = '/marketplace/'; state.query = new URLSearchParams('category=cars')
  state.fetch.mockReturnValueOnce(new Promise(() => {}))
  await act(async () => root.render(<OfferMarquee />))
  expect(host.textContent).not.toContain('Home only')
  expect(state.fetch.mock.calls[1][0]).toContain('category=cars')
})
