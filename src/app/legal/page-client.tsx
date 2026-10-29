'use client'

import { useSearchParams } from 'next/navigation'
import LegalPolicyClient from './[slug]/page-client'

export default function LegalPolicyQuery() {
  const slug = useSearchParams().get('slug') || ''
  if (!slug) return <main className="mx-auto max-w-2xl px-4 py-10">Choose a published policy from the site links.</main>
  return <LegalPolicyClient slug={slug} fallbackTitle="Legal Policy" />
}
