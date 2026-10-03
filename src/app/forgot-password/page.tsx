import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import ForgotPasswordPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/forgot-password/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("forgot_password", baseMetadata)
}

export default function Page() {
  return <ForgotPasswordPage />
}
