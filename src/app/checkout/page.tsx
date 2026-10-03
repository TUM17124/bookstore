import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import CheckoutPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/checkout/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("checkout", baseMetadata)
}

export default function Page() {
  return <CheckoutPage />
}
