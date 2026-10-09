import type { Metadata } from "next"
import HiddenBooksPage from "./page-client"

export const metadata: Metadata = {
  title: "Hidden books — PlugYard",
  robots: { index: false, follow: true },
}

export default function Page() {
  return <HiddenBooksPage />
}
