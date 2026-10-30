"use client"

import { useEffect, useState } from 'react'

import { getLegalPages, policyHref, policyLabel, type PublicPolicy } from '@/lib/legal'

export function usePublishedPolicies() {

 const [pages,setPages]=useState<PublicPolicy[]>([])

 const [state,setState]=useState<'loading'|'ready'|'error'>('loading')

 useEffect(()=>{let live=true; getLegalPages().then(data=>{if(!Array.isArray(data.pages)) throw new Error('Invalid policies');if(live){setPages(data.pages);setState('ready')}}).catch(()=>{if(live)setState('error')});return()=>{live=false}},[])

 return { pages, state }

}


export function PolicyContextLinks({slugs}:{slugs:string[]}) {
 const {pages}=usePublishedPolicies()
 return <nav aria-label="Applicable legal policies" className="my-4 flex flex-wrap gap-3 text-sm underline"><a href="/legal/" target="_blank" rel="noopener noreferrer">All legal policies</a>{pages.filter(p=>slugs.includes(p.slug)).map(p=><a key={p.slug} href={policyHref(p.slug)} target="_blank" rel="noopener noreferrer">{policyLabel(p)}</a>)}</nav>
}
