import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import type { ReactNode } from "react"
import { PdfEditorShell } from "./pdf-editor-shell"

// Title and description: Django admin → Site: SEO (applied at build).
const baseMetadata: Metadata = {
  title: "Free PDF Editor",
  description:
    "Edit, annotate, and save PDFs directly in your browser — free, with auto-save. Add text, images, signatures, and shapes. No software to install. Sign in to access your documents.",
  alternates: {
    canonical: "https://plugyard.com/tools/pdf-editor",
  },
}

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("pdf_editor", baseMetadata)
}

export default function PdfEditorLayout({ children }: { children: ReactNode }) {
  return <PdfEditorShell>{children}</PdfEditorShell>
}
