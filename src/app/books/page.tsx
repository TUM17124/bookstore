import { Suspense } from "react"
import { pageMetadata } from "@/lib/seo"
import BooksDepartment from "./page-client"
export const generateMetadata = () => pageMetadata("books", { title: "Books", alternates: { canonical: "/books/" } })
export default function Page() { return <Suspense fallback={<p className="p-8">Loading books…</p>}><BooksDepartment /></Suspense> }
