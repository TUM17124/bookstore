import type { Metadata } from "next"
import MarketplacePage from "./page-client"

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Discover books, electronics, furniture, vehicles, services, and more from PlugYard sellers.",
  alternates: { canonical: "/marketplace/" },
  openGraph: { title: "PlugYard Marketplace", description: "Discover products and services from PlugYard sellers.", url: "/marketplace/" },
}

export default function Page() { return <MarketplacePage /> }
