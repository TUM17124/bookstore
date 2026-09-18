import type { Metadata } from "next"
import LoginPage from "./page-client"

export const metadata: Metadata = {
  title: "Log In",
  description:
    "Log in to your PlugYard account to access your library, bookmarks, reading progress, and purchases.",
  alternates: {
    canonical: "https://plugyard.com/login/",
  },
}

export default function Page() {
  return <LoginPage />
}
