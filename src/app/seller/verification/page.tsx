import type { Metadata } from 'next'
import VerificationClient from './page-client'
export const metadata: Metadata = { title: 'Seller Verification | PlugYard', robots: { index: false, follow: false } }
export default function Page() { return <VerificationClient/> }
