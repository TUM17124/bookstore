import type { Metadata } from "next"
import TermsPage from "./page-client"

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "PlugYard's Terms of Use: rules for accessing the catalogue, paid ebooks and audiobooks, and publisher tools.",
  alternates: {
    canonical: "https://plugyard.com/terms-of-use/",
  },
}

export default function Page() {
  return <TermsPage />
}
