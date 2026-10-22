import type { Metadata } from 'next'
import GuestOrderClient from './page-client'
export const metadata: Metadata = { title: 'Secure Order Access | PlugYard', robots: { index: false, follow: false } }
export default function Page(){return <GuestOrderClient/>}
