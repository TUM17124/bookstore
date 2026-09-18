import type { Metadata } from "next"
import SignupPage from "./page-client"

export const metadata: Metadata = {
  title: "Create an Account",
  description:
    "Create a free PlugYard account to save your reading place, get personal book picks, and track your purchases.",
  alternates: {
    canonical: "https://plugyard.com/signup/",
  },
}

export default function Page() {
  return <SignupPage />
}
