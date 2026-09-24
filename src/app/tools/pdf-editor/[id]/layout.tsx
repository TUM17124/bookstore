"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { isLoggedIn } from "@/lib/auth-client"

// Auth is a client-side token check (bookstore's own pattern, see
// src/app/settings/page-client.tsx) and the document is loaded at runtime,
// so this route can't be statically rendered.
export const dynamic = "force-dynamic"

export default function PdfEditorLayout({ children }: { children?: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setLoggedIn(isLoggedIn())
    setReady(true)
  }, [])

  if (!ready) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p className="text-sm text-foreground/60">Loading…</p>
      </main>
    )
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold">PDF Editor</h1>
        <p className="mt-3 text-sm text-foreground/60">
          Sign in to open the PDF editor.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/login?next=/tools/pdf-editor" className="underline">
            Log in
          </Link>
        </p>
      </main>
    )
  }

  return <>{children}</>
}
