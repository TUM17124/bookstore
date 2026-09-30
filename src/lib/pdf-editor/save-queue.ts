import type { PendingOperation } from "./offline-queue";

/** Only saves of this document can affect its unsaved-changes indicator. */
export function isDocumentSave(
  op: PendingOperation,
  documentId: string | null,
  storedDocumentId?: string | null,
): boolean {
  return op.type === "save_document" && Boolean(
    (documentId && op.payload.documentId === documentId) ||
    (storedDocumentId && op.payload.storedDocumentId === storedDocumentId)
  );
}
