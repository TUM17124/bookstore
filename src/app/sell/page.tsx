import type { Metadata } from "next"
import SellPage from "./page-client"

export const metadata: Metadata = { title: "Sell on PlugYard", robots: { index: false, follow: false } }
export default function Page() { return <SellPage /> }
