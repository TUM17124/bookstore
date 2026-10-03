import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import PublishPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Publish a Book",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/publish/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("publish", baseMetadata)
}

export default function Page() {
  return <PublishPage />
}
