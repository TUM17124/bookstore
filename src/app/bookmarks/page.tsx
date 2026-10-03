import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import BookmarksPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Your Bookmarks",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/bookmarks/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("bookmarks", baseMetadata)
}

export default function Page() {
  return <BookmarksPage />
}
