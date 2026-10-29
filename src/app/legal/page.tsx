import { Suspense } from 'react'
import type { Metadata } from 'next'
import LegalPolicyQuery from './page-client'

export const metadata: Metadata = { title: 'Legal Policy', robots: { index: false, follow: true } }

export default function LegalPage() {
  return <Suspense fallback={<main className="p-8">Loading policy…</main>}><LegalPolicyQuery /></Suspense>
}
