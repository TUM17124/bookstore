import type { Metadata } from "next"
import SuccessPage from "./page-client"

export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/checkout/success/",
  },
}

export default function Page() {
  return <SuccessPage />
}
