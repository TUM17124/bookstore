import type { Metadata } from "next"
import GuestLibraryPage from "./page-client"

export const metadata: Metadata = {
  title: "Your books",
  robots: { index: false, follow: false },
  // The purchase-link token arrives in this page's URL: never send it to
  // other origins in a Referer header.
  referrer: "no-referrer",
}

export default function Page() {
  return <GuestLibraryPage />
}
