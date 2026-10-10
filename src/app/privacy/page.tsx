import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import TermsPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How PlugYard collects, uses, shares, and protects your personal data, and the choices available to you.",
  alternates: {
    canonical: "https://plugyard.com/privacy/",
  },
  robots: { index: true, follow: true },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("privacy", baseMetadata)
}

export default function Page() {
  return <TermsPage />
}
