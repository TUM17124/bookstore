import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import GuestLibraryPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Your books",
  robots: { index: false, follow: false },
  // The purchase-link token arrives in this page's URL: never send it to
  // other origins in a Referer header.
  referrer: "no-referrer",
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("library_guest", baseMetadata)
}

export default function Page() {
  return <GuestLibraryPage />
}
