import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import ProPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "PlugYard Pro",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "https://plugyard.com/pro/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("pro", baseMetadata)
}

export default function Page() {
  return <ProPage />
}
