import type { Metadata } from "next"
import ForgotPasswordPage from "./page-client"

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/forgot-password/",
  },
}

export default function Page() {
  return <ForgotPasswordPage />
}
