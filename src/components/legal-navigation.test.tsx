// @vitest-environment jsdom
import React, {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import LegalIndex from '@/app/legal/page-client'
import Policy from '@/app/legal/[slug]/page-client'
const api=vi.hoisted(()=>({get:vi.fn()}))
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}))
vi.mock('next/link',()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
vi.mock('@/components/legal-overlay',()=>({LegalOverlay:({title,children}:{title:string;children:React.ReactNode})=><main><h1>{title}</h1>{children}</main>}))
vi.mock('@/lib/legal',async original=>({...await original<typeof import('@/lib/legal')>(),getLegalPages:api.get}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);api.get.mockReset()})
afterEach(()=>{act(()=>root.unmount());host.remove()})
it('indexes every public document and preserves the service terms route',async()=>{api.get.mockResolvedValue({pages:[{slug:'terms',title:'Terms & Conditions',policy_version:'legacy'},{slug:'new-policy',title:'New published policy',policy_version:2}]});await act(async()=>root.render(<LegalIndex/>));expect(host.textContent).toContain('Terms of Service');expect(host.querySelector('a')?.getAttribute('href')).toBe('/terms/');expect(host.querySelectorAll('a')[1].getAttribute('href')).toBe('/legal/?slug=new-policy')})
it('renders the complete approved body, version and effective date',async()=>{api.get.mockResolvedValue({pages:[{slug:'seller-policy',title:'Seller Policy',policy_version:3,effective_at:'2026-10-29T23:00:00Z',body:'<h2>First clause</h2><p>Final obligation.</p>'}]});await act(async()=>root.render(<Policy slug="seller-policy" fallbackTitle="Policy"/>));expect(host.querySelector('article')?.textContent).toContain('Final obligation.');expect(host.textContent).toContain('Version 3');expect(host.textContent).toContain('Effective 2026-10-29');expect(host.querySelector('nav a')?.getAttribute('href')).toBe('/legal/')})
it('does not substitute another document or footer for an unpublished policy',async()=>{api.get.mockResolvedValue({pages:[]});await act(async()=>root.render(<Policy slug="private" fallbackTitle="Policy"/>));expect(host.querySelector('article')).toBeNull();expect(host.textContent).toContain('not currently published')})
it('shows a load error rather than an empty legal body',async()=>{api.get.mockRejectedValue(new Error('offline'));await act(async()=>root.render(<Policy slug="terms" fallbackTitle="Terms of Service"/>));expect(host.querySelector('[role="alert"]')).not.toBeNull()})
