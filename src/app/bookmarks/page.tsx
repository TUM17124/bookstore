import type { Metadata } from "next"
import { redirect } from "next/navigation"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Wishlist",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/wishlist/",
  },
}

export const metadata = baseMetadata

export default function Page() {
  redirect("/wishlist")
}
