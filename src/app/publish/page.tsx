'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getToken } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL!

const CATEGORIES = [
  { value: 'business-compliance', label: 'Business & Compliance' },
  { value: 'career', label: 'Career' },
  { value: 'academic', label: 'Academic' },
  { value: 'personal-finance', label: 'Personal Finance' },
  { value: 'lifestyle', label: 'Lifestyle' },
]

export default function PublishPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [isFree, setIsFree] = useState(false)

  useEffect(() => {
    setLoggedIn(!!getToken())
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setOk('')
    const formEl = e.currentTarget
    const fd = new FormData(formEl)

    if (!fd.get('category')) {
      setError('Pick a category.')
      return
    }
    if (!fd.get('image_front') || !(fd.get('image_front') as File).size) {
      setError('Front cover is required (1600×2400).')
      return
    }
    if (!fd.get('image_spine') || !(fd.get('image_spine') as File).size) {
      setError('Spine is required (160×2400).')
      return
    }
    if (!fd.get('image_back') || !(fd.get('image_back') as File).size) {
      setError('Back cover is required (1600×2400).')
      return
    }
    if (!fd.get('pdf') || !(fd.get('pdf') as File).size) {
      setError('PDF file is required.')
      return
    }

    fd.set('is_free', isFree ? 'true' : 'false')
    if (isFree) {
      fd.set('ebook_price', '0')
      fd.set('audiobook_price', '0')
    }

    setBusy(true)
    try {
      const token = getToken()
      const res = await fetch(`${API}/me/books/`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data.error || (data.missing ? `Missing: ${data.missing.join(', ')}` : 'Submit failed'),
        )
      }
      setOk(data.message || 'Submitted for review.')
      formEl.reset()
      setIsFree(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    }
    setBusy(false)
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold">Publish a book</h1>
        <p className="mt-3 text-sm text-foreground/60">
          Sign in to submit a title for review.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/login?next=/publish" className="underline">Log in</Link>
          {' · '}
          <Link href="/signup?next=/publish" className="underline">Sign up</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold">Publish a book</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Required: front, spine, back, and PDF. Audio is optional. An admin reviews before it goes on the shelf.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/70">
        <li>Front: 1600 × 2400 px</li>
        <li>Back: 1600 × 2400 px</li>
        <li>Spine: 160 × 2400 px</li>
      </ul>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
        <input name="title" required placeholder="Title" className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />
        <input name="author" placeholder="Author" className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />
        <input
          name="year"
          required
          inputMode="numeric"
          placeholder="Year (e.g. 2026)"
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />

        <label className="text-sm font-medium">Category</label>
        <select
          name="category"
          required
          defaultValue=""
          className="rounded-lg border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="" disabled>
            Select a category
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <textarea name="description" rows={4} placeholder="Short blurb" className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />

        <label className="text-sm font-medium">Front cover *</label>
        <input name="image_front" type="file" accept="image/*" required />
        <label className="text-sm font-medium">Spine *</label>
        <input name="image_spine" type="file" accept="image/*" required />
        <label className="text-sm font-medium">Back cover *</label>
        <input name="image_back" type="file" accept="image/*" required />
        <label className="text-sm font-medium">PDF *</label>
        <input name="pdf" type="file" accept="application/pdf" required />
        <label className="text-sm font-medium">Audiobook (optional MP3)</label>
        <input name="audio" type="file" accept="audio/*" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
          Free to read
        </label>

        {!isFree && (
          <>
            <input name="ebook_price" type="number" min="0" step="1" placeholder="Ebook price (KES)" className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />
            <input name="audiobook_price" type="number" min="0" step="1" placeholder="Audiobook price (KES)" className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />
          </>
        )}

        <label className="text-sm font-medium">Sneak view pages</label>
        <input
          name="preview_pages"
          type="number"
          min="0"
          max="20"
          defaultValue={4}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        <p className="text-[13px] text-foreground/55">
          Sneak view is the number of pages a visitor can read before buying.
          Example: 4 means the first four pages only. Use 0 to turn sneak view off.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-xl border-2 border-red-600 bg-red-100 p-3 text-sm font-semibold text-red-800 dark:border-red-400 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {ok && (
          <p
            role="status"
            className="rounded-xl border-2 border-green-600 bg-green-100 p-3 text-sm font-semibold text-green-800 dark:border-green-400 dark:bg-green-950 dark:text-green-300"
          >
            {ok}
          </p>
        )}
        <button type="submit" disabled={busy} className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">
          {busy ? 'Uploading…' : 'Submit for review'}
        </button>
      </form>
    </main>
  )
}