/**
 * Base URL of the standalone PDF-math service (see bookstore_pdf_service, a
 * sibling project). bookstore deploys as a static export (output: "export"),
 * which cannot run Next.js API routes, so PDF byte-level operations
 * (parse/preview/annotate/export/etc.) live in that separate Node service
 * instead of same-origin /api/pdf/* routes.
 */
export const PDF_SERVICE_URL =
  process.env.NEXT_PUBLIC_PDF_SERVICE_URL ?? "http://localhost:8002";
