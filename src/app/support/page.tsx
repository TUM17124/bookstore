import type { Metadata } from 'next'
import SupportClient from './page-client'
export const metadata: Metadata = { title: 'Customer Care | PlugYard', robots: { index: false, follow: false } }
export default function Page() { return <SupportClient/> }
