import type { Metadata } from "next"
import TermsPage from "./page-client"

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "PlugYard's refund policy for digital ebook and audiobook purchases, including Boost ads and how to request a refund.",
  alternates: {
    canonical: "https://plugyard.com/refund-policy/",
  },
}

export default function Page() {
  return <TermsPage />
}
