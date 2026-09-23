import type { Metadata } from "next"
import ProPage from "./page-client"

export const metadata: Metadata = {
  title: "PlugYard Pro",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "https://plugyard.com/pro/",
  },
}

export default function Page() {
  return <ProPage />
}
