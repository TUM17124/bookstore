"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileEdit,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@giga-pdf/ui";
import { api, getAuthToken, type StoredDocument } from "@/lib/pdf-editor/api";
import { PDF_SERVICE_URL } from "@/lib/pdf-editor/pdf-service";

/**
 * "My Documents" — the PDF editor's own saved-files list.
 *
 * GigaPDF's real dashboard (apps/web/src/app/(app)/(dashboard)/documents)
 * is a large folders/tags/drag-drop-multi-format-import/thumbnail/full-text-
 * search page - out of scope to fully port here. This is a deliberately
 * scoped page covering the actually-reported gap (users had NO way to see
 * or reopen a saved document at all): list, search, open, delete, and the
 * same "choose a PDF / start blank" entry points the editor's own empty
 * state already uses.
 */
export default function EditorDocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listDocuments({
        page: 1,
        per_page: 50,
        search: searchTerm || undefined,
      });
      setDocuments(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [search, load]);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.saveDocument({ file, name: file.name });
      router.push(`/tools/pdf-editor?id=${result.stored_document_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
    }
  }

  async function handleBlank() {
    setBusy(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const blankResp = await fetch(`${PDF_SERVICE_URL}/pdf/blank`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ size: "a4", orientation: "portrait" }),
      });
      if (!blankResp.ok) {
        throw new Error(`Could not create a blank document (${blankResp.status}).`);
      }
      const blob = await blankResp.blob();
      const file = new File([blob], "Untitled.pdf", { type: "application/pdf" });
      const result = await api.saveDocument({ file, name: "Untitled" });
      router.push(`/tools/pdf-editor?id=${result.stored_document_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a blank document.");
      setBusy(false);
    }
  }

  async function handleDelete(doc: StoredDocument, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm(`Delete "${doc.name}"? This can't be undone from here.`)) return;
    setDeletingId(doc.stored_document_id);
    try {
      await api.deleteDocument(doc.stored_document_id);
      setDocuments((prev) => prev.filter((d) => d.stored_document_id !== doc.stored_document_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the document.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto min-h-[calc(100dvh-4rem)] max-w-5xl px-4 py-8">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My PDF documents</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Choose PDF
          </Button>
          <Button variant="outline" onClick={() => void handleBlank()} disabled={busy} className="gap-2">
            <Plus className="h-4 w-4" />
            Start blank
          </Button>
        </div>
      </div>

      <div className="relative mt-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your documents…"
          className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-16 text-center">
            <FileEdit className="mb-4 h-10 w-10 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-semibold">
              {search ? "No documents match your search" : "No documents yet"}
            </h3>
            {!search && (
              <p className="text-sm text-muted-foreground">
                Choose a PDF to upload, or start a blank one, to see it here.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {documents.map((doc) => (
              <button
                key={doc.stored_document_id}
                type="button"
                onClick={() => router.push(`/tools/pdf-editor?id=${doc.stored_document_id}`)}
                className="group relative flex flex-col items-stretch overflow-hidden rounded-lg border border-input bg-background text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="flex aspect-[3/4] items-center justify-center bg-muted/30">
                  {doc.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={doc.thumbnail_url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.name || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.page_count} page{doc.page_count === 1 ? "" : "s"} ·{" "}
                      {new Date(doc.modified_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete document"
                    onClick={(e) => void handleDelete(doc, e)}
                    disabled={deletingId === doc.stored_document_id}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    {deletingId === doc.stored_document_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
