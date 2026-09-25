/**
 * user-signatures.ts
 *
 * Shared contract for the account-saved signature/initials marks served by
 * Django's `/api/editor/signatures/` (see bookstore_backend/shop/
 * views_editor.py's UserSignaturesView). Consumed by BOTH surfaces that list
 * saved marks: the capture dialog (one-click insert inside the dialog) and
 * the toolbar's signature dropdown (one-click insert without opening the
 * dialog) — a single fetch helper so the JSON shape is decoded in exactly
 * one place.
 */

/** Whether a mark is a full signature or a short set of initials. */
export type SignatureKind = "signature" | "initials";

/** A signature/initials mark persisted to the caller's account. */
export interface UserSignatureMark {
  id: string;
  kind: SignatureKind;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

/** The payload handed to the editor when a mark is inserted on the page. */
export interface SignatureInsertPayload {
  dataUrl: string;
  width: number;
  height: number;
  kind: SignatureKind;
}

/**
 * Fetch the account's saved marks. Failures (offline, signed-out, 5xx) resolve
 * to an empty list — the saved marks are a convenience, never a blocker.
 */
export async function fetchUserSignatures(): Promise<UserSignatureMark[]> {
  try {
    const { api } = await import("@/lib/pdf-editor/api");
    const { signatures } = await api.listUserSignatures();
    return Array.isArray(signatures) ? signatures : [];
  } catch {
    return [];
  }
}

/**
 * Persist a captured mark to the account. Best-effort — a failure must never
 * block the caller from inserting the mark onto the page.
 */
export async function saveUserSignature(mark: {
  kind: SignatureKind;
  dataUrl: string;
  width: number;
  height: number;
}): Promise<void> {
  try {
    const { api } = await import("@/lib/pdf-editor/api");
    await api.saveUserSignature(mark);
  } catch {
    // Ignore — the user still gets their mark inserted.
  }
}

/** Delete a saved mark. Best-effort — a stale entry is harmless. */
export async function deleteUserSignature(id: string): Promise<void> {
  try {
    const { api } = await import("@/lib/pdf-editor/api");
    await api.deleteUserSignature(id);
  } catch {
    // Ignore — refreshed on next dialog open.
  }
}
