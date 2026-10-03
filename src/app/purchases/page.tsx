import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import PurchasesPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Your Purchases",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/purchases/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("purchases", baseMetadata)
}

export default function Page() {
  return <PurchasesPage />
}
