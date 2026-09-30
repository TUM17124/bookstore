import type { Metadata } from "next"
import LoginPage from "./page-client"

export const metadata: Metadata = {
  title: "Log In",
  description:
    "Log in to your PlugYard account to access your purchased eBooks, audiobooks, saved PDFs, bookmarks, and reading progress.",
  alternates: {
    canonical: "https://plugyard.com/login/",
  },
}

export default function Page() {
  return <LoginPage />
}
