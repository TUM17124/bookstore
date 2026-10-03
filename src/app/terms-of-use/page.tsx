import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import TermsPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Terms of Use",
  description:
    "PlugYard's Terms of Use: rules for accessing the catalogue, paid ebooks and audiobooks, and publisher tools.",
  alternates: {
    canonical: "https://plugyard.com/terms-of-use/",
  },
  robots: { index: false, follow: true },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("terms_of_use", baseMetadata)
}

export default function Page() {
  return <TermsPage />
}
