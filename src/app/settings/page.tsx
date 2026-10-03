import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import SettingsPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Account Settings",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/settings/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("settings", baseMetadata)
}

export default function Page() {
  return <SettingsPage />
}
