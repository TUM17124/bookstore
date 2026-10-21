import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import LoginPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Log In | PlugYard",
  description:
    "Log in to manage marketplace listings, books, offers, sales, and purchases on PlugYard.",
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
