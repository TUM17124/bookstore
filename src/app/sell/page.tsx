import type { Metadata } from "next"
import LegacySellRedirect from "./legacy-redirect"

export const metadata: Metadata = { title: "Sell & Publish on PlugYard", robots: { index: false, follow: false } }
export default function Page() { return <LegacySellRedirect /> }
