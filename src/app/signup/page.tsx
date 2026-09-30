import type { Metadata } from "next"
import SignupPage from "./page-client"

export const metadata: Metadata = {
  title: "Sign Up — Create a Free Account",
  description:
    "Create a free PlugYard account to access the PDF editor, save bookmarks, track your eBook and audiobook purchases, and sync your reading progress across devices.",
  alternates: {
    canonical: "https://plugyard.com/signup/",
  },
}

export default function Page() {
  return <SignupPage />
}
