import type { Metadata } from "next"
import VerifyEmailPage from "./page-client"

export const metadata: Metadata = {
  title: "Verify Your Email",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/verify-email/",
  },
}

export default function Page() {
  return <VerifyEmailPage />
}
