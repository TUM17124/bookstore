import type { Metadata } from "next"
import BookmarksPage from "./page-client"

export const metadata: Metadata = {
  title: "Your Bookmarks",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/bookmarks/",
  },
}

export default function Page() {
  return <BookmarksPage />
}
