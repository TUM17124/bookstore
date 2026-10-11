import type { Metadata } from "next"
import NotesPage from "./page-client"

export const metadata: Metadata = {
  title: "My notes",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://plugyard.com/notes/" },
}

export default function Page() {
  return <NotesPage />
}
