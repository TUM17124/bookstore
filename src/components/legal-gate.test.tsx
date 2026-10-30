// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LegalGate } from './legal-gate'

const api = vi.hoisted(() => ({ pages: vi.fn() }))
vi.mock('@/lib/api', () => ({ getToken: () => 'synthetic-token' }))
vi.mock('@/lib/legal', async original => ({...await original<typeof import('@/lib/legal')>(), getLegalStatus: async () => ({ legal_required: true }), needsLegalAccept: () => true, getLegalPages: api.pages, acceptLegal: vi.fn() }))
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  api.pages.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

it('offers every policy returned by Admin-controlled publication, including new slugs', async () => {
  api.pages.mockResolvedValue({ pages: [{ slug: 'terms', title: 'Terms' }, { slug: 'new-policy', title: 'New approved policy' }] })
  await act(async () => root.render(<LegalGate />))
  expect([...host.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(['/terms/', '/legal/?slug=new-policy'])
  expect(host.querySelector('button')?.disabled).toBe(false)
})

it('does not accept while policy discovery fails', async () => {
  api.pages.mockRejectedValue(new Error('Unavailable'))
  await act(async () => root.render(<LegalGate />))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded')
  const accept = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('I have read and accept'))
  expect(accept?.disabled).toBe(true)
})
