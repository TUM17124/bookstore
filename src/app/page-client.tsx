"use client"
import { Suspense } from "react"
import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MarketplaceHome } from "@/components/marketplace/marketplace-home"
export { toCfg } from "@/components/books-department-legacy"

function Home() {
  const query = useSearchParams()
  const router = useRouter()
  const legacyBookLink = query.has("book") || query.has("category") || query.has("view")
  const queryString = query.toString()
  useEffect(() => {
    if (legacyBookLink) router.replace(`/books/${queryString ? `?${queryString}` : ""}`, { scroll: false })
  }, [legacyBookLink, queryString, router])
  if (legacyBookLink) return <main className="flex min-h-[50dvh] items-center justify-center p-8"><p role="status">Opening Books…</p></main>
  return <MarketplaceHome />
}
export default function HomePageClient() {
  return <Suspense fallback={<main aria-busy="true" className="p-8">Loading marketplace…</main>}><Home /></Suspense>
}
