import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import ResetPasswordPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Reset Password",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/reset-password/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("reset_password", baseMetadata)
}

export default function Page() {
  return <ResetPasswordPage />
}
