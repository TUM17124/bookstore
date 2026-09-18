import type { Metadata } from "next"
import TermsPage from "./page-client"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How PlugYard collects, uses, shares, and protects your personal data, and the choices available to you.",
  alternates: {
    canonical: "https://plugyard.com/privacy/",
  },
}

export default function Page() {
  return <TermsPage />
}
