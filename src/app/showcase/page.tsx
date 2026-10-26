import type { Metadata } from 'next'
import { Suspense } from 'react'
import DemoShowcase from './page-client'

export const metadata: Metadata = {
  title: 'Demonstration showcase',
  description: 'PlugYard marketplace demonstrations. Not for sale; no real bids or payments.',
  robots: { index: false, follow: false },
}
export default function Page() {
  return <Suspense fallback={<p role="status">Loading demonstration showcase…</p>}><DemoShowcase /></Suspense>
}
