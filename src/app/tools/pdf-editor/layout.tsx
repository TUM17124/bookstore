"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { isLoggedIn } from "@/lib/auth-client"

// Scoped to this route rather than the app root - the vendored @giga-pdf/api
// hooks (use-documents, use-elements, use-auth, etc.) call useQueryClient()
// and need a provider somewhere above them in the tree. One instance per
// layout mount is correct here (the editor is the only consumer).
function useEditorQueryClient() {
  const [client] = useState(() => new QueryClient())
  return client
}

// Auth is a client-side token check (bookstore's own pattern, see
// src/app/settings/page-client.tsx), and the document id is read from a
// query param client-side (see page.tsx) - this route is fully static
// buildable under output: "export", no server-side dynamic routing needed.

export default function PdfEditorLayout({ children }: { children?: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const queryClient = useEditorQueryClient()

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

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
