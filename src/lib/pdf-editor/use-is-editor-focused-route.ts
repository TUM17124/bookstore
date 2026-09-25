"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * True only while the user is actively INSIDE the focused editor view
 * (`/tools/pdf-editor?id=...`) — the one surface that hides the site nav/
 * footer for its own full-viewport layout. Every other pdf-editor surface
 * (the landing/upload prompt at `/tools/pdf-editor` with no `id`, and
 * `/tools/pdf-editor/documents`) is a normal site page and keeps the usual
 * nav + footer, per redesign #5.
 */
export function useIsEditorFocusedRoute(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEditorRoute =
    pathname === "/tools/pdf-editor" || pathname === "/tools/pdf-editor/";
  return isEditorRoute && Boolean(searchParams?.get("id"));
}
