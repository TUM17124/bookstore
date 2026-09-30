import type { Metadata } from "next"
import HomePageClient from "./page-client"

export const metadata: Metadata = {
  title: "PlugYard — Buy eBooks & Audiobooks Online | No Account Needed",
  description:
    "Shop Kenya's eBook and audiobook store. Buy and instantly read or listen — no account required. AI-powered narration on every title. Sign up to save your purchases and sync progress. Free built-in PDF editor with auto-save. Browse business, career, academic, personal finance, and lifestyle titles.",
  alternates: {
    canonical: "https://plugyard.com/",
  },
}

export default function Page() {
  return <HomePageClient />
}
