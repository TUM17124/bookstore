"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function RedirectByCategory() {
  const router = useRouter()
  const query = useSearchParams()
  useEffect(() => {
    const category = query.get("category")
    router.replace(category ? `/publish/?category=${encodeURIComponent(category)}` : "/publish/")
  }, [query, router])
  return <main className="p-8" role="status">Opening Sell &amp; Publish…</main>
}

export default function LegacySellRedirect() {
  return <Suspense fallback={<main className="p-8" role="status">Opening Sell &amp; Publish…</main>}><RedirectByCategory /></Suspense>
}
