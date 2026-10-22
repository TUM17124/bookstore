import type { Metadata } from "next"
import SellerOrdersPage from "./page-client"

export const metadata: Metadata = { title: "Seller Orders", robots: { index: false, follow: false } }

export default function Page() { return <SellerOrdersPage /> }
