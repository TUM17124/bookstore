"use client"

import { useEffect, useState } from "react"
import { LegalOverlay } from "@/components/legal-overlay"
import { getLegalPages } from "@/lib/legal"

export default function TermsPage() {
  const [title, setTitle] = useState("Privacy Policy")
  const [html, setHtml] = useState("<p>Loading…</p>")
  const [updated, setUpdated] = useState("")

  useEffect(() => {
    getLegalPages("privacy").then((d) => {
      const p = d.pages?.[0]
      if (!p) {
        setHtml("<p>This page is not published yet.</p>")
        return
      }
      setTitle(p.title)
      setHtml(p.body)
      if (p.updated_at) setUpdated(new Date(p.updated_at).toLocaleDateString())
    })
  }, [])

  return (
    <LegalOverlay title={title} updated={updated}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </LegalOverlay>
  )
}