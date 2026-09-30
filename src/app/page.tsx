import type { Metadata } from "next"
import HomePageClient from "./page-client"

export const metadata: Metadata = {
  title: "PlugYard — Kenya's eBook & Audiobook Store",
  description:
    "Buy and instantly read eBooks and audiobooks on PlugYard — no account needed. Includes a free in-browser PDF editor with auto-save and a smart PDF reader. Explore practical guides covering business, career, academic, personal finance, and lifestyle.",
  alternates: {
    canonical: "https://plugyard.com/",
  },
}

export default function Page() {
  return <HomePageClient />
}
