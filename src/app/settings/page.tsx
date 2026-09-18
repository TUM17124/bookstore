import type { Metadata } from "next"
import SettingsPage from "./page-client"

export const metadata: Metadata = {
  title: "Account Settings",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/settings/",
  },
}

export default function Page() {
  return <SettingsPage />
}
