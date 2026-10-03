import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import SignupPage from "./page-client"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Sign Up — Create a Free Account | PlugYard",
  description:
    "Create a free PlugYard account to publish and sell your eBooks and audiobooks, access the PDF editor, save bookmarks, and track your purchases across devices.",
  alternates: {
    canonical: "https://plugyard.com/signup/",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("signup", baseMetadata)
}

export default function Page() {
  return <SignupPage />
}
