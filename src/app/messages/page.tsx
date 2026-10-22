import type { Metadata } from 'next'
import MessagesClient from './page-client'
export const metadata: Metadata = { title: 'Messages | PlugYard', robots: { index: false, follow: false } }
export default function Page() { return <MessagesClient/> }
