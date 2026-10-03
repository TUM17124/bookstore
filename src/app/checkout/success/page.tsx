import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import SuccessPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/checkout/success/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("checkout_success", baseMetadata)
}

export default function Page() {
  return <SuccessPage />
}
