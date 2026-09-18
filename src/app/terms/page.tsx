import type { Metadata } from "next"
import TermsPage from "./page-client"

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Read PlugYard's Terms & Conditions: account use, free and paid titles, payments, delivery, and publishing on the platform.",
  alternates: {
    canonical: "https://plugyard.com/terms/",
  },
}

export default function Page() {
  return <TermsPage />
}
