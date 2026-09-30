import type { Metadata } from "next"
import SignupPage from "./page-client"

export const metadata: Metadata = {
  title: "Sign Up — Create a Free Account | PlugYard",
  description:
    "Create a free PlugYard account to publish and sell your eBooks and audiobooks, access the PDF editor, save bookmarks, and track your purchases across devices.",
  alternates: {
    canonical: "https://plugyard.com/signup/",
  },
}

export default function Page() {
  return <SignupPage />
}
