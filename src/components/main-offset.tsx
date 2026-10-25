"use client"
import { Suspense } from "react"
import { OfferMarquee } from "@/components/offer-marquee"
// Only the contextual announcement depends on query parameters. Page HTML
// remains server-renderable while its query context becomes available.
export function MainOffset({ children }: { children: React.ReactNode }) {
  return <div className="site-main site-main-offset"><Suspense fallback={null}><OfferMarquee /></Suspense>{children}</div>
}
