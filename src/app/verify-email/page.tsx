import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import VerifyEmailPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Verify Your Email",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/verify-email/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("verify_email", baseMetadata)
}

export default function Page() {
  return <VerifyEmailPage />
}
