import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import HomePageClient from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "PlugYard — Buy or Sell eBooks & Audiobooks | No Account Needed to Buy",
  description:
    "Kenya's marketplace for books, electronics, vehicles, furniture, services, and more. Shop public listings or sell your own products.",
  alternates: {
    canonical: "https://plugyard.com/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("home", baseMetadata)
}

export default function Page() {
  return <HomePageClient />
}
