'use client'
import { useEffect, useState } from 'react'
import { LegalOverlay } from '@/components/legal-overlay'
import { getLegalPages } from '@/lib/legal'
export default function LegalPolicyClient({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) { const [title,setTitle]=useState(fallbackTitle), [html,setHtml]=useState('<p>Loading…</p>'), [updated,setUpdated]=useState(''); useEffect(() => { getLegalPages(slug).then((data) => { const page=data.pages?.[0]; if (!page) { setHtml('<p>This policy is being prepared and is not published yet.</p>'); return } setTitle(page.title); setHtml(page.body); if(page.updated_at) setUpdated(new Date(page.updated_at).toLocaleDateString()) }).catch(() => setHtml('<p>This policy could not be loaded.</p>')) },[slug]); return <LegalOverlay title={title} updated={updated}><div dangerouslySetInnerHTML={{__html:html}}/></LegalOverlay> }
