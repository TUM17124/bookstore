import type { Metadata } from "next"
import SellerProfilePage from "./page-client"

export const metadata: Metadata = { title: "Seller Profile", robots: { index: false, follow: false } }
export default function Page() { return <SellerProfilePage /> }
