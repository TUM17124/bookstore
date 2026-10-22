import type { Metadata } from "next"
import AuctionsPage from "./page-client"

export const metadata: Metadata = {
  title: "Live Auctions",
  description: "Browse upcoming and live auctions from approved PlugYard marketplace sellers.",
  alternates: { canonical: "/auctions/" },
  openGraph: { title: "Live Auctions on PlugYard", description: "Browse upcoming and live marketplace auctions.", url: "/auctions/" },
}

export default function Page() { return <AuctionsPage /> }
