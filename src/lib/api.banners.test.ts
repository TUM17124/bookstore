// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBanners } from './api'

describe('banner request audience at the HTTP boundary', () => {
  beforeEach(() => { localStorage.clear(); delete window.__pyPre })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the member token through the real shared request client', async () => {
    const token = `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, user_id: 123 }))}.x`
    localStorage.setItem('access_token', token)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ banners: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await getBanners('home')
    const init = fetch.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${token}`)
    expect(init.cache).toBe('no-store')
    expect(new Headers(init.headers).get('X-Visitor-Id')).toBeTruthy()
  })

  it('does not send an authenticated identity for a guest', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ banners: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await getBanners('home')
    expect(new Headers(fetch.mock.calls[0][1].headers).has('Authorization')).toBe(false)
  })
})
