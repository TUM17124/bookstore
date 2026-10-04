'use client'

import { useCurrency } from '@/lib/money'
import { useFeature, useLimits, useOffMessage, useText } from '@/lib/site-config'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getToken, publishBook } from '@/lib/api'
import { api as editorApi } from '@/lib/pdf-editor/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'
import { AuthFetchError } from '@/lib/auth-fetch'
import { UserError } from '@/lib/user-error'
import { useCategories } from '@/lib/categories'


function PublishPageInner() {
  const currency = useCurrency()
  const searchParams = useSearchParams()
  // Admin-editable (Django admin → Site: General → Publish page; Site: Limits;
  // Site: Features → publishing).
  const guestIntro = useText('publish.guest_intro')
  const intro = useText('publish.intro')
  const sneakHelp = useText('publish.sneak_help')
  const { default_preview_pages: previewDefault } = useLimits()
  const publishingOn = useFeature('publishing')
  const publishingOff = useOffMessage('publishing')
  const editorDocumentId = searchParams.get('editor_document_id') || ''

  const [loggedIn, setLoggedIn] = useState(false)
  // Admin-defined categories (Django admin → Categories), not a fixed list.
  const { all: categories } = useCategories()
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [ebookDownloadable, setEbookDownloadable] = useState(true)
  const [audiobookDownloadable, setAudiobookDownloadable] = useState(true)
  // Attached from the PDF editor's "Publish" button - the PDF is copied
  // server-side from the saved document, so the browser never
  // downloads/re-uploads it. "Remove" reverts to a normal file upload.
  const [attachedName, setAttachedName] = useState('')
  const [attachRemoved, setAttachRemoved] = useState(false)
  const hasAttachment = Boolean(editorDocumentId) && !attachRemoved

  useEffect(() => {
    setLoggedIn(!!getToken())
  }, [])

  useEffect(() => {
    if (!editorDocumentId) return
    editorApi.getStoredDocument(editorDocumentId).then(
      (doc) => setAttachedName(doc.name || 'Untitled.pdf'),
      () => setAttachedName('Untitled.pdf'),
    )
  }, [editorDocumentId])

  // Upload + create: idempotent server-side, so a dropped connection is
  // retried with ONE key and can never create the book twice.
  const submit = useAsyncAction(
    async (ctx, fd: FormData) => {
      try {
        return await publishBook(fd, ctx)
      } catch (err) {
        const missing = err instanceof AuthFetchError ? err.body.missing : null
        if (Array.isArray(missing) && missing.length) throw new UserError(`Missing: ${missing.join(', ')}`)
        throw err
      }
    },
    { errorFallback: 'Submit failed. Please try again.' },
  )

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
    if (hasAttachment) {
      fd.delete('pdf')
      fd.set('editor_document_id', editorDocumentId)
    } else if (!fd.get('pdf') || !(fd.get('pdf') as File).size) {
      setError('PDF file is required.')
      return
    }

    fd.set('is_free', isFree ? 'true' : 'false')
    if (isFree) {
      fd.set('ebook_price', '0')
      fd.set('audiobook_price', '0')
    }
    fd.set('ebook_downloadable', ebookDownloadable ? 'true' : 'false')
    fd.set('audiobook_downloadable', audiobookDownloadable ? 'true' : 'false')

    const data = await submit.run(fd)
    if (!data) return // failed (shown under the button) or cancelled
    setOk(data.message || 'Submitted for review.')
    formEl.reset()
    setIsFree(false)
    setEbookDownloadable(true)
    setAudiobookDownloadable(true)
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold">Publish a book</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/65">{guestIntro}</p>
        <p className="mt-6 text-sm">
          <Link href="/login?next=/publish" className="underline">Log in</Link>
          {' · '}
          <Link href="/signup?next=/publish" className="underline">Create a free account</Link>
        </p>
      </main>
    )
  }

  if (!publishingOn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold">Publish a book</h1>
        <div role="status" className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-semibold">Publishing is turned off</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/70">{publishingOff}</p>
        </div>
        <p className="mt-6 text-sm">
          <Link href="/dashboard" className="underline">Go to your dashboard</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold">Publish a book</h1>
      <p className="mt-2 text-sm text-foreground/60">{intro}</p>
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
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
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
        <label className="text-sm font-medium">Book file *</label>
        {hasAttachment ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              Already attached: <span className="font-medium">{attachedName || 'Loading…'}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachRemoved(true)}
              className="shrink-0 text-xs font-medium text-foreground/60 underline hover:text-foreground"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <input name="pdf" type="file" accept=".pdf,.epub,.docx,.doc,.odt,.rtf,.txt,.pptx,.ppt,application/pdf,application/epub+zip" required />
            <p className="text-xs text-foreground/60">
              PDF, EPUB, Word (.docx, .doc), OpenDocument (.odt), RTF, plain text, or PowerPoint (.pptx, .ppt).
              Word, text and slide files are converted to PDF for you (usually under a minute);
              EPUB keeps its reflowable text. Files with macros, DRM or fixed layouts are not accepted. Up to 30 MB.
            </p>
          </>
        )}
        <label className="text-sm font-medium">Audiobook (optional MP3)</label>
        <input name="audio" type="file" accept="audio/*" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
          Free to read
        </label>

        {!isFree && (
          <>
            <input name="ebook_price" type="number" min="0" step="1" placeholder={`Ebook price (${currency.code})`} className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />
            <input name="audiobook_price" type="number" min="0" step="1" placeholder={`Audiobook price (${currency.code})`} className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2" />
          </>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ebookDownloadable} onChange={(e) => setEbookDownloadable(e.target.checked)} />
          Allow ebook download
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={audiobookDownloadable} onChange={(e) => setAudiobookDownloadable(e.target.checked)} />
          Allow audiobook download
        </label>

        <label className="text-sm font-medium">Sneak view pages</label>
        <input
          name="preview_pages"
          type="number"
          min="0"
          max="20"
          key={previewDefault}
          defaultValue={previewDefault}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        <p className="text-[13px] text-foreground/55">{sneakHelp}</p>

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
        <ActionButton
          type="submit"
          action={submit}
          loadingLabel="Uploading…"
          successLabel="Submitted"
          errorClassName="rounded-xl border-2 border-red-600 bg-red-100 p-3 text-sm font-semibold text-red-800 dark:border-red-400 dark:bg-red-950 dark:text-red-300"
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50 aria-busy:opacity-80"
        >
          Submit for review
        </ActionButton>
      </form>
    </main>
  )
}

// useSearchParams() requires a Suspense boundary or the static export's
// build-time prerender of /_not-found fails.
export default function PublishPage() {
  return (
    <Suspense fallback={null}>
      <PublishPageInner />
    </Suspense>
  )
}