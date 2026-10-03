import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import LoginPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Log In | PlugYard",
  description:
    "Log in to your PlugYard account to manage your published eBooks and audiobooks, track sales, access your purchases, and open the PDF editor.",
  alternates: {
    canonical: "https://plugyard.com/login/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("login", baseMetadata)
}

export default function Page() {
  return <LoginPage />
}
