"use client"
import { useEffect,useState } from 'react'
import { LegalOverlay } from '@/components/legal-overlay'
import { getLegalPages,policyLabel,type PublicPolicy } from '@/lib/legal'
export default function LegalPolicyClient({slug,fallbackTitle}:{slug:string;fallbackTitle:string}) {
 const [page,setPage]=useState<PublicPolicy|null>(null),[state,setState]=useState('loading')
 useEffect(()=>{let live=true;setPage(null);setState('loading');getLegalPages(slug).then(data=>{if(live){setPage(data.pages?.find((p:PublicPolicy)=>p.slug===slug)||null);setState('ready')}}).catch(()=>{if(live)setState('error')});return()=>{live=false}},[slug])
 return <LegalOverlay title={page?policyLabel(page):fallbackTitle}>{state==='loading'?<p role="status">Loading policy?</p>:state==='error'?<p role="alert">This policy could not be loaded. Please reload this page.</p>:page?<article aria-label={page.title}><p className="my-4 text-sm text-muted-foreground">{page.title} ? {page.policy_version==='legacy'?'Existing published document':`Version ${page.policy_version}`}{page.effective_at&&` · Effective ${new Date(page.effective_at).toISOString().slice(0,10)}`}{page.updated_at&&` · Updated ${new Date(page.updated_at).toISOString().slice(0,10)}`}</p><div dangerouslySetInnerHTML={{__html:page.body}}/></article>:<p>This policy is not currently published.</p>}</LegalOverlay>
}
