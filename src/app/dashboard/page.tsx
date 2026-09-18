import type { Metadata } from "next"
import DashboardPage from "./page-client"

export const metadata: Metadata = {
  title: "Publisher Dashboard",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/dashboard/",
  },
}

export default function Page() {
  return <DashboardPage />
}
