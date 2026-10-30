// @vitest-environment jsdom
import React, {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import LegalIndex from '@/app/legal/page-client'
import {SiteFooter} from '@/components/site-footer'
import {PolicyContextLinks} from '@/components/published-policies'
import {policyHref} from '@/lib/legal'
import Policy from '@/app/legal/[slug]/page-client'
const api=vi.hoisted(()=>({get:vi.fn(),replace:vi.fn()}))
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:api.replace})}))
vi.mock('next/link',()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
vi.mock('@/components/legal-overlay',()=>({LegalOverlay:({title,children}:{title:string;children:React.ReactNode})=><main><h1>{title}</h1>{children}</main>}))
vi.mock('@/lib/legal',async original=>({...await original<typeof import('@/lib/legal')>(),getLegalPages:api.get}))
vi.mock('@/lib/categories',()=>({useCategories:()=>({navbar:[]}),categoryHref:()=>'/marketplace/'}))
vi.mock('@/components/brand-logo',()=>({BrandLogo:()=>null}))
vi.mock('@/lib/site-config',()=>({useText:(key:string)=>key,usePairs:()=>[],useSupportEmail:()=>'',fill:(value:string)=>value}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);api.get.mockReset()})
afterEach(()=>{act(()=>root.unmount());host.remove()})
it('retires the landing page without exposing a substitute index',async()=>{await act(async()=>root.render(<LegalIndex/>));expect(api.replace).toHaveBeenCalledWith('/');expect(host.querySelectorAll('a')).toHaveLength(0)})
it('renders the complete approved body, version and effective date',async()=>{api.get.mockResolvedValue({pages:[{slug:'seller-policy',title:'Seller Policy',policy_version:3,effective_at:'2026-10-29T23:00:00Z',body:'<h2>First clause</h2><p>Final obligation.</p>'}]});await act(async()=>root.render(<Policy slug="seller-policy" fallbackTitle="Policy"/>));expect(host.querySelector('article')?.textContent).toContain('Final obligation.');expect(host.textContent).toContain('Version 3');expect(host.textContent).toContain('Effective 2026-10-29');expect(host.querySelector('a[href="/legal/"]')).toBeNull()})
it('does not substitute another document or footer for an unpublished policy',async()=>{api.get.mockResolvedValue({pages:[]});await act(async()=>root.render(<Policy slug="private" fallbackTitle="Policy"/>));expect(host.querySelector('article')).toBeNull();expect(host.textContent).toContain('not currently published')})
it('shows a load error rather than an empty legal body',async()=>{api.get.mockRejectedValue(new Error('offline'));await act(async()=>root.render(<Policy slug="terms" fallbackTitle="Terms of Service"/>));expect(host.querySelector('[role="alert"]')).not.toBeNull()})

it('links all ten documents directly in both footer layouts without a landing-page link',async()=>{
 const slugs=['terms','privacy','terms-of-use','refund-policy','buyer-protection','shipping-delivery','seller-policy','acceptable-use','payments-payouts','auction-terms']
 api.get.mockResolvedValue({pages:slugs.map(slug=>({slug,title:slug}))})
 await act(async()=>root.render(<SiteFooter/>))
 expect(host.textContent).not.toContain('All legal policies')
 expect(host.querySelector('a[href="/legal/"]')).toBeNull()
 for(const slug of slugs)expect(host.querySelectorAll(`a[href="${policyHref(slug)}"]`)).toHaveLength(2)
 expect(policyHref('auction-terms')).toBe('/legal/auction-terms/')
})
it('keeps workflow links limited to published relevant documents',async()=>{
 api.get.mockResolvedValue({pages:[{slug:'seller-policy',title:'Seller Policy'},{slug:'privacy',title:'Privacy'}]})
 await act(async()=>root.render(<PolicyContextLinks slugs={['seller-policy','draft-policy']}/>))
 expect([...host.querySelectorAll('a')].map(a=>a.getAttribute('href'))).toEqual(['/legal/seller-policy/'])
})
