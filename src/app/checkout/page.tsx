import type { Metadata } from "next"
import CheckoutPage from "./page-client"

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://plugyard.com/checkout/",
  },
}

export default function Page() {
  return <CheckoutPage />
}
