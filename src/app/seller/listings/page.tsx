import type { Metadata } from "next"
import SellerListings from "./page-client"
export const metadata: Metadata = { title: "Your marketplace listings", robots: { index: false, follow: false } }
export default function Page() { return <SellerListings /> }
