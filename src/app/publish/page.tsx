import type { Metadata } from "next"
import PublishPage from "./page-client"

export const metadata: Metadata = {
  title: "Publish a Book",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/publish/",
  },
}

export default function Page() {
  return <PublishPage />
}
