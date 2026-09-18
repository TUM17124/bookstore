import type { Metadata } from "next"
import PdfEditorPage from "./page-client"

export const metadata: Metadata = {
  title: "Free PDF Editor — Edit PDFs Online",
  description:
    "PlugYard's free online PDF editor: add images and text, rearrange pages, and password-protect a PDF — entirely in your browser, with nothing uploaded to any server.",
  alternates: {
    canonical: "https://plugyard.com/tools/pdf-editor/",
  },
}

export default function Page() {
  return <PdfEditorPage />
}
