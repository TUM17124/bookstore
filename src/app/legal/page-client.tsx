"use client"
import {useEffect} from 'react'
import {useRouter,useSearchParams} from 'next/navigation'
import LegalPolicyClient from './[slug]/page-client'
// Preserve old direct-document query links; the bare landing page is retired.
export default function LegalPolicyQuery(){
 const slug=useSearchParams().get('slug')||''
 const router=useRouter()
 useEffect(()=>{if(!slug)router.replace('/')},[slug,router])
 return slug?<LegalPolicyClient slug={slug} fallbackTitle="Legal Policy"/>:null
}
