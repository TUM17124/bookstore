import type { Metadata } from "next"
import OffersPage from "./page-client"
export const metadata: Metadata = { title: "Private offers", robots: { index: false, follow: false } }
export default function Page() { return <OffersPage /> }
