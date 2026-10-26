"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import BookLibrary from "@/components/books-department-legacy"
import { MarketplaceHome } from "@/components/marketplace/marketplace-home"
export { toCfg } from "@/components/books-department-legacy"

function Home() {
  const query = useSearchParams()
  // Preserve historical shared links and purchased-book reader entry points.
  return query.has("book") || query.has("category") || query.has("view")
    ? <BookLibrary /> : <MarketplaceHome />
}
export default function HomePageClient() {
  return <Suspense fallback={<main aria-busy="true" className="p-8">Loading marketplace…</main>}><Home /></Suspense>
}
