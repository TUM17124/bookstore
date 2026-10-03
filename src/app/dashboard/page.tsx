import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import DashboardPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Publisher Dashboard",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/dashboard/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("dashboard", baseMetadata)
}

export default function Page() {
  return <DashboardPage />
}
