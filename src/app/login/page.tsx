import type { Metadata } from "next"
import LoginPage from "./page-client"

export const metadata: Metadata = {
  title: "Log In | PlugYard",
  description:
    "Log in to your PlugYard account to manage your published eBooks and audiobooks, track sales, access your purchases, and open the PDF editor.",
  alternates: {
    canonical: "https://plugyard.com/login/",
  },
}

export default function Page() {
  return <LoginPage />
}
