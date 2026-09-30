import type { Metadata } from "next"
import HomePageClient from "./page-client"

export const metadata: Metadata = {
  title: "PlugYard — Buy or Sell eBooks & Audiobooks | No Account Needed to Buy",
  description:
    "Kenya's eBook and audiobook marketplace. Buy and instantly read or listen — no account required. Publish your own titles, set your price, and get paid directly. AI-powered narration on every eBook. Free built-in PDF editor with auto-save. Sign up to track purchases and sync reading progress.",
  alternates: {
    canonical: "https://plugyard.com/",
  },
}

export default function Page() {
  return <HomePageClient />
}
