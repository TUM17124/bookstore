"use client"
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import LegalPolicyClient from './[slug]/page-client'
import { usePublishedPolicies } from '@/components/published-policies'
import { policyHref, policyLabel } from '@/lib/legal'
export default function LegalPolicyQuery() {
 const slug=useSearchParams().get('slug')||''
 const {pages,state}=usePublishedPolicies()
 if(slug)return <LegalPolicyClient slug={slug} fallbackTitle="Legal Policy" />
 return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-3xl font-bold">Legal policies</h1><p className="mt-3">Read the current published documents that apply to using PlugYard, buying, selling and auctions.</p>{state==='loading'&&<p role="status">Loading published policies?</p>}{state==='error'&&<p role="alert">Policies could not be loaded. Please reload this page.</p>}<ul className="mt-6 space-y-4">{pages.map(p=><li key={p.slug} className="rounded-xl border p-4"><Link href={policyHref(p.slug)} className="font-semibold underline">{policyLabel(p)}</Link>{p.slug==='terms'&&<p className="text-sm">Published document: {p.title}</p>}<p className="mt-1 text-sm text-muted-foreground">{p.policy_version==='legacy'?'Existing published document':`Version ${p.policy_version}`}{p.effective_at&&` · Effective ${new Date(p.effective_at).toISOString().slice(0,10)}`}</p></li>)}</ul></main>
}
