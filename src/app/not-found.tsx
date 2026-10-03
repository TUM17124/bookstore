import type { Metadata } from "next"
import { NotFoundClient } from "@/components/not-found-client"

export const metadata: Metadata = { title: "Page not found", robots: { index: false } }

export default function NotFound() {
  return <NotFoundClient />
}
