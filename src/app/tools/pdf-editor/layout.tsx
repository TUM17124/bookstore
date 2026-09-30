import type { Metadata } from "next"
import type { ReactNode } from "react"
import { PdfEditorShell } from "./pdf-editor-shell"

export const metadata: Metadata = {
  title: "Free PDF Editor",
  description:
    "Edit, annotate, and save PDFs directly in your browser — free, with auto-save. Add text, images, signatures, and shapes. No software to install. Sign in to access your documents.",
  alternates: {
    canonical: "https://plugyard.com/tools/pdf-editor",
  },
}

export default function PdfEditorLayout({ children }: { children: ReactNode }) {
  return <PdfEditorShell>{children}</PdfEditorShell>
}
