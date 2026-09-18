import type { Metadata } from "next"
import HomePageClient from "./page-client"

export const metadata: Metadata = {
  title: "PlugYard — Kenyan digital library",
  description:
    "Read and download Kenyan statutes and practical guides: business and compliance, career, academic, personal finance, and lifestyle. Official public-law texts, free to read.",
  alternates: {
    canonical: "https://plugyard.com/",
  },
}

export default function Page() {
  return <HomePageClient />
}
