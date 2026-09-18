import type { Metadata } from "next"
import ResetPasswordPage from "./page-client"

export const metadata: Metadata = {
  title: "Reset Password",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/reset-password/",
  },
}

export default function Page() {
  return <ResetPasswordPage />
}
