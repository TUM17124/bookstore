import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import HomePageClient from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "PlugYard — Buy or Sell eBooks & Audiobooks | No Account Needed to Buy",
  description:
    "Kenya's eBook and audiobook marketplace. Buy and instantly read or listen — no account required. Publish your own titles, set your price, and get paid directly. AI-powered narration on every eBook. Free built-in PDF editor with auto-save. Sign up to track purchases and sync reading progress.",
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
