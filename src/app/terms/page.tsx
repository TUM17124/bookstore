import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import TermsPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Read PlugYard's Terms & Conditions: account use, free and paid titles, payments, delivery, and publishing on the platform.",
  alternates: {
    canonical: "https://plugyard.com/terms/",
  },
  robots: { index: true, follow: true },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("terms", baseMetadata)
}

export default function Page() {
  return <TermsPage />
}
