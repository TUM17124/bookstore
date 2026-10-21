import type { Metadata } from 'next'
import LegalPolicyClient from './page-client'
const titles: Record<string,string> = { 'buyer-protection': 'Buyer Protection Policy', 'shipping-delivery': 'Shipping & Delivery Policy', 'seller-policy': 'Seller Policy', 'acceptable-use': 'Acceptable Use & Prohibited Products', 'payments-payouts': 'Payments & Seller Payout Policy' }
export function generateStaticParams() { return Object.keys(titles).map((slug) => ({ slug })) }
export async function generateMetadata({ params }: { params: Promise<{slug:string}> }): Promise<Metadata> { const { slug } = await params; const title = titles[slug] || 'Legal Policy'; return { title: `${title} | PlugYard`, alternates: { canonical: `https://plugyard.com/legal/${slug}/` }, robots: { index: true, follow: true } } }
export default async function Page({ params }: { params: Promise<{slug:string}> }) { const { slug } = await params; return <LegalPolicyClient slug={slug} fallbackTitle={titles[slug] || 'Legal Policy'}/> }
