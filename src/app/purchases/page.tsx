import type { Metadata } from "next"
import PurchasesPage from "./page-client"

export const metadata: Metadata = {
  title: "Your Purchases",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/purchases/",
  },
}

export default function Page() {
  return <PurchasesPage />
}
