import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import TermsPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Refund Policy",
  description:
    "PlugYard's refund policy for digital ebook and audiobook purchases, including ad balance top-ups and how to request a refund.",
  alternates: {
    canonical: "https://plugyard.com/refund-policy/",
  },
  robots: { index: false, follow: true },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("refund_policy", baseMetadata)
}

export default function Page() {
  return <TermsPage />
}
