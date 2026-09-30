"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/pdf-editor/api";
import { PDF_SERVICE_URL } from "@/lib/pdf-editor/pdf-service";
import { clientLogger } from "@/lib/pdf-editor/client-logger";
import { sortPagesByNumber, renumberPages } from "@/lib/pdf-editor/page-order";
import type { DocumentObject, DocumentLanguageInfo, PageObject, BookmarkObject, LayerObject, EmbeddedFileObject, Element } from "@giga-pdf/types";

// Tolerance for "same position" heuristic when matching parsed PDF elements
// against Redis elements that have a different elementId (post-bake case).
// Only compare X,Y — width/height differ between the user's text-box size
// (stored in Redis) and the rendered text width returned by the PDF parser.
// Increased to 8 to absorb per-render position drift across multiple bake cycles.
const DEDUP_POS_TOLERANCE = 8;

function boundsApproxEqual(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    Math.abs(a.x - b.x) <= DEDUP_POS_TOLERANCE &&
    Math.abs(a.y - b.y) <= DEDUP_POS_TOLERANCE
  );
}

function elementContent(el: Element): string {
  if (el.type === "text" || el.type === "annotation") return el.content ?? "";
  return "";
}

/**
 * Merge backend Redis elements into PDF-parsed elements at reload time.
 *
 * Two pipelines persist user-added elements: Redis (sync via api.createElement)
 * and PDF S3 (debounced 2s via apply-elements + upload). At reload only the PDF
 * is read via parse-from-s3, so elements added in the last few seconds are
 * invisible until baked. Merging the Redis layer closes that race window.
 *
 * Dedup happens in two passes:
 *   1. elementId match — Redis wins (latest user edits)
 *   2. Heuristic match (same type + content + bounds ±2px) — drops parsed
 *      duplicates of already-baked Redis elements that came back with a fresh
 *      elementId from the PDF parser
 */
function mergeBackendElements(
  parsedElements: Element[],
  backendElements: Element[],
): Element[] {
  const byId = new Map<string, Element>();
  for (const el of parsedElements) byId.set(el.elementId, el);
  for (const el of backendElements) byId.set(el.elementId, el);

  // Pass 2: drop parsed elements that look like baked copies of a Redis element
  const backendSignatures = backendElements.map((el) => ({
    type: el.type,
    content: elementContent(el),
    bounds: el.bounds,
    elementId: el.elementId,
  }));
  const filtered: Element[] = [];

  // Track already-accepted (content, page) signatures to deduplicate parsed
  // elements that appear more than once in the PDF binary (can happen when a
  // document was saved while the reload-duplicate bug was still active).
  const parsedSeenKey = new Set<string>();

  for (const el of byId.values()) {
    const isBackendOriginal = backendSignatures.some((s) => s.elementId === el.elementId);
    if (isBackendOriginal) {
      filtered.push(el);
      continue;
    }
    const elContent = elementContent(el);
    const looksBaked = backendSignatures.some((s) => {
      if (s.type !== el.type) return false;
      const sContent = s.content;
      // Exact match (single-line or already-normalized content).
      if (sContent === elContent && boundsApproxEqual(s.bounds, el.bounds)) return true;
      // Multi-line text: the PDF renderer writes each visual line as a separate
      // text object. Two layouts to handle:
      //
      //   a) Old renderer (single addText call): parser merges all lines back
      //      WITHOUT newlines → "line1line2line3". Strip \n from both sides.
      //
      //   b) New renderer (one addText call per line): parser returns one element
      //      per line → "line1", "line2", … Each line is a proper substring of
      //      the original multi-line Redis content. Match if the parsed content
      //      equals any individual line of the Redis element, or the full content
      //      after stripping newlines.
      if (s.type === "text" && sContent.includes("\n")) {
        // Case (a): full content strip match.
        if (sContent.replace(/\n/g, "") === elContent.replace(/\n/g, "")) return true;
        // Case (b): parsed element is a single baked line of the Redis element.
        if (sContent.split("\n").some((line) => line === elContent && line.length > 0)) return true;
      }
      return false;
    });
    if (looksBaked) continue;

    // Dedup within parsed elements: if the PDF binary itself has duplicates
    // (e.g., written twice during a previous reload-bug session), only keep
    // the first occurrence of each (type + content + approximate position).
    if (el.type === "text" && elContent.length > 0) {
      const rx = Math.round(el.bounds.x / DEDUP_POS_TOLERANCE);
      const ry = Math.round(el.bounds.y / DEDUP_POS_TOLERANCE);
      const key = `${rx}:${ry}:${elContent}`;
      if (parsedSeenKey.has(key)) continue;
      parsedSeenKey.add(key);
    }

    filtered.push(el);
  }
  return filtered;
}

export interface UseDocumentOptions {
  /** ID du document stocké (S3) - si fourni, charge depuis le stockage */
  storedDocumentId?: string;
  /** ID du document de session - si fourni, charge depuis la session */
  sessionDocumentId?: string;
  /**
   * Aplatir les Form XObjects au chargement (mode éditeur uniquement).
   * Quand true, le texte des factures/templates (stocké dans des Form
   * XObjects) devient éditable en place. Les visionneuses en lecture seule
   * (embed) laissent ce flag à false pour ne JAMAIS réécrire le PDF.
   */
  flatten?: boolean;
}

/** Phase courante du chargement d'un document (jalons réels du pipeline). */
export type LoadPhase =
  | "idle"
  | "connecting"
  | "analyzing"
  | "elements"
  | "building"
  | "error";

/**
 * Progression du chargement, synchronisée sur les jalons réels du pipeline
 * (A connecting → B analyzing → C elements → D building). `value` est garanti
 * monotone, borné [0, 100], et n'atteint jamais 100 avant la fin réelle.
 * La phase `analyzing` (B) est un estimateur borné honnête (< 60) car le fetch
 * du parse ne fournit pas de progression en octets ; un endpoint SSE serait
 * nécessaire pour de vrais octets.
 */
export interface LoadProgress {
  phase: LoadPhase;
  /** 0 → 100, monotone et borné. */
  value: number;
  /** Pages dont les éléments ont été fusionnés (phase `elements`). */
  pagesParsed: number;
  /** Total de pages à fusionner (phase `elements`). */
  pagesTotal: number;
}

export interface UseDocumentReturn {
  /** Document chargé */
  document: DocumentObject | null;
  /** Nom du document */
  name: string;
  /** Pages du document */
  pages: PageObject[];
  /** Page actuelle */
  currentPage: PageObject | null;
  /** Index de la page actuelle (0-based) */
  currentPageIndex: number;
  /** Chargement en cours */
  loading: boolean;
  /**
   * Progression détaillée du chargement (barre + jalons réels). Reste à
   * `phase: 'idle'` quand aucun document n'est demandé. NE conditionne PAS la
   * révélation de l'éditeur (qui reste gated sur `loading`) — purement
   * informatif/visuel.
   */
  loadProgress: LoadProgress;
  /** Erreur de chargement */
  error: string | null;
  /** ID du document de session (pour les appels API) */
  documentId: string | null;
  /** ID du document stocké */
  storedDocumentId: string | null;
  /** Naviguer vers une page */
  goToPage: (pageIndex: number) => void;
  /** Recharger le document */
  reload: () => Promise<void>;
  /** Document modifié (non sauvegardé) */
  isDirty: boolean;
  /** Marquer comme modifié */
  setDirty: (dirty: boolean) => void;
  /** Ajouter une nouvelle page */
  addPage: () => void;
  /** Supprimer une page */
  deletePage: (pageIndex: number) => void;
  /** Réordonner les pages */
  reorderPages: (fromIndex: number, toIndex: number) => void;
  /** Dupliquer une page */
  duplicatePage: (pageIndex: number) => void;
  /** Ajouter un élément au scene graph d'une page (miroir du canvas Fabric) */
  addElementToPage: (pageIndex: number, element: Element) => void;
  /** Mettre à jour un élément du scene graph */
  updateElementInPage: (elementId: string, updates: Partial<Element>) => void;
  /** Retirer un élément du scene graph */
  removeElementFromPage: (elementId: string) => void;
  /** Remplacer les pages du scene graph (après re-parse post page-op) */
  replacePages: (pages: PageObject[]) => void;
  /** Mettre à jour le nom du document */
  setName: (name: string) => void;
  /** Table des matières (signets) */
  outlines: BookmarkObject[];
  /**
   * Direction de lecture / écriture dominante détectée (badge informatif +
   * pré-sélection de l'écriture OCR). Absent quand indétectable.
   */
  documentLanguage?: DocumentLanguageInfo;
  /** Calques OCG du document (lecture seule) */
  layers: LayerObject[];
  /**
   * Calques utilisateur (Phase 2 "Layer Groups") — construction d'édition
   * uniquement (PAS des OCG PDF). Vivent dans l'état de l'éditeur ; la
   * persistance cross-session du membership nécessiterait des métadonnées
   * backend (non implémenté).
   */
  userLayers: LayerObject[];
  /** Créer un calque utilisateur (ajouté en haut de pile : order = max+1). */
  createLayer: (name: string) => LayerObject;
  /** Supprimer un calque + détacher (layerId=null) tous ses éléments. */
  deleteLayer: (layerId: string) => void;
  /** Renommer un calque utilisateur. */
  renameLayer: (layerId: string, name: string) => void;
  /** Changer l'ordre d'empilement d'un calque utilisateur. */
  reorderLayer: (layerId: string, newOrder: number) => void;
  /** Masquer/afficher un calque — cascade sur element.visible des membres. */
  setLayerVisible: (layerId: string, visible: boolean) => void;
  /** Verrouiller/déverrouiller un calque — cascade sur element.locked. */
  setLayerLocked: (layerId: string, locked: boolean) => void;
  /** Affecter un élément à un calque utilisateur (ou null pour le détacher). */
  assignElementToLayer: (elementId: string, layerId: string | null) => void;
  /**
   * Restaurer (cross-session) les calques utilisateur + le membership en UN
   * seul batch d'état : remplace `userLayers` et ré-attache `element.layerId`
   * pour chaque entrée `membership[elementId] = layerId`. N'affecte PAS
   * `isDirty` (c'est une restauration, pas une édition). Les ré-renders sont
   * minimisés (un seul passage sur les pages).
   */
  restoreLayers: (
    layers: LayerObject[],
    membership: Record<string, string>,
  ) => void;
  /** Fichiers embarqués */
  embeddedFiles: EmbeddedFileObject[];
  /**
   * PDF aplati (Form XObjects inlinés) renvoyé par parse-from-s3 quand
   * `flatten` est actif ET qu'au moins un Form XObject a été inliné. Les
   * `elements` parsés correspondent à CE binaire, donc l'éditeur doit
   * l'adopter comme `currentPdfFile` pour rester cohérent (save + raster).
   * `null` si form-less / flatten désactivé (le binaire S3 d'origine convient).
   */
  flattenedPdfFile: File | null;
}

// Génère un ID unique pour les nouvelles pages
function generatePageId(): string {
  return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Génère un ID unique pour les calques utilisateur (crypto si dispo).
function generateLayerId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook pour charger et gérer un document PDF.
 *
 * @example
 * // Charger un document depuis le stockage S3
 * const { document, pages, loading } = useDocument({ storedDocumentId: "abc123" });
 *
 * @example
 * // Charger un document de session (après upload)
 * const { document, pages } = useDocument({ sessionDocumentId: "xyz789" });
 */
export function useDocument(options: UseDocumentOptions): UseDocumentReturn {
  const { storedDocumentId, sessionDocumentId, flatten = false } = options;

  const [document, setDocument] = useState<DocumentObject | null>(null);
  const [name, setName] = useState<string>("");
  const [documentId, setDocumentId] = useState<string | null>(
    sessionDocumentId || null
  );
  const [storedId, setStoredId] = useState<string | null>(
    storedDocumentId || null
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setDirty] = useState(false);
  // Flattened PDF bytes (Form XObjects inlined) when `flatten` is active and at
  // least one form was inlined. Decoded once at load; consumed by the editor.
  const [flattenedPdfFile, setFlattenedPdfFile] = useState<File | null>(null);
  // Editor-only user layers (Phase 2 "Layer Groups"). Kept separate from the
  // document's OCG `layers` (read-only). Reset on document (re)load.
  const [userLayers, setUserLayers] = useState<LayerObject[]>([]);

  // Progression du chargement (barre synchronisée aux jalons A→D).
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    phase: "idle",
    value: 0,
    pagesParsed: 0,
    pagesTotal: 0,
  });
  // Estimateur borné de la phase B (analyzing) — interval nettoyé partout.
  const estimatorRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEstimator = useCallback(() => {
    if (estimatorRef.current !== null) {
      clearInterval(estimatorRef.current);
      estimatorRef.current = null;
    }
  }, []);

  // Mise à jour monotone + bornée de la progression. Le reset de fin/début de
  // chargement (phase connecting, value 0) passe par un setLoadProgress direct
  // pour réinitialiser la baseline monotone.
  const advanceProgress = useCallback((patch: Partial<LoadProgress>) => {
    setLoadProgress((prev) => {
      const raw = patch.value ?? prev.value;
      const value = Math.max(prev.value, Math.min(100, raw));
      return { ...prev, ...patch, value };
    });
  }, []);

  // Phase B : estimateur honnête. Pas d'octets réels (le fetch du parse n'est
  // pas streamé), donc on approche 58 de façon asymptotique (ralentit en
  // approchant) et on ne franchit JAMAIS 60 avant la résolution réelle du parse.
  const startAnalyzingEstimator = useCallback(() => {
    stopEstimator();
    estimatorRef.current = setInterval(() => {
      setLoadProgress((prev) => {
        const ceil = 58; // strictement < 60 : 60 est réservé au SNAP réel
        if (prev.value >= ceil) return prev;
        const next = prev.value + (ceil - prev.value) * 0.1;
        return { ...prev, value: Math.max(prev.value, next) };
      });
    }, 120);
  }, [stopEstimator]);

  // Charger le document
  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFlattenedPdfFile(null);
    setUserLayers([]);
    // A — connecting : reset complet de la baseline monotone (pas advanceProgress).
    stopEstimator();
    setLoadProgress({ phase: "connecting", value: 0, pagesParsed: 0, pagesTotal: 0 });

    try {
      let docId = sessionDocumentId;
      let docName = "";

      // Si on a un storedDocumentId, charger d'abord depuis S3
      if (storedDocumentId && !sessionDocumentId) {
        const loadResult = await api.loadDocument(storedDocumentId);
        docId = loadResult.document_id;
        docName = loadResult.name;
        setStoredId(storedDocumentId);
      }

      if (!docId) {
        throw new Error("Aucun ID de document fourni");
      }

      setDocumentId(docId);
      // A terminée : la session/le binaire S3 sont résolus.
      advanceProgress({ value: 8 });

      // Récupérer le document complet avec pages et éléments (TS parser via S3)
      clientLogger.debug("[useDocument] Calling /api/pdf/parse-from-s3 for docId:", docId);
      const { invalidateAuthToken, ensureFreshAuthToken } = await import(
        "@/lib/pdf-editor/api"
      );
      // Retry once on 401 with a refreshed token. This is the very first thing
      // that happens when a document is opened, so a stale access token here
      // is what users experience as "the document won't open" — and the throw
      // below is the generic `Parse failed: 401` with no way to recover.
      const sendParse = (token: string | null) =>
        fetch(`${PDF_SERVICE_URL}/pdf/parse-from-s3`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ documentId: docId, flatten }),
          credentials: "include",
        });
      // B — analyzing : démarrer l'estimateur borné AVANT le fetch du parse.
      advanceProgress({ phase: "analyzing" });
      startAnalyzingEstimator();
      let authToken = await ensureFreshAuthToken();
      let parseResp = await sendParse(authToken);
      if (parseResp.status === 401 && authToken) {
        invalidateAuthToken();
        const freshToken = await ensureFreshAuthToken();
        if (freshToken && freshToken !== authToken) {
          authToken = freshToken;
          parseResp = await sendParse(authToken);
        }
      }
      // Parse résolu : stopper l'estimateur et SNAP à 60 (fin réelle de B).
      stopEstimator();
      advanceProgress({ value: 60 });
      if (!parseResp.ok) {
        throw new Error(
          parseResp.status === 401 || parseResp.status === 403
            ? "Your session expired. Please sign in again to open this document."
            : `Parse failed: ${parseResp.status}`,
        );
      }
      const parsePayload = await parseResp.json() as Record<string, unknown>;
      const docData = (parsePayload.data ?? parsePayload) as typeof parsePayload & {
        pages: Array<Record<string, unknown>>;
        document_id?: string;
        metadata?: Record<string, unknown>;
      };

      // Adopt the flattened binary when the route inlined Form XObjects. The
      // returned `elements` correspond to these bytes, so the editor must use
      // them as currentPdfFile to keep save + raster consistent. Decoded here;
      // surfaced via flattenedPdfFile. (Form-less loads omit these fields.)
      const flattenCount = (docData.flattenCount as number | undefined) ?? 0;
      const flattenedB64 = docData.flattenedPdfBase64 as string | undefined;
      if (flatten && flattenCount > 0 && flattenedB64) {
        try {
          const binary = atob(flattenedB64);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          setFlattenedPdfFile(
            new File([arr], `${docName || "document"}.pdf`, { type: "application/pdf" }),
          );
          clientLogger.debug("[useDocument] Adopted flattened PDF", { flattenCount });
        } catch (err) {
          clientLogger.warn("[useDocument] Failed to decode flattened PDF — keeping S3 binary", err);
        }
      }

      // Debug: log raw API response
      clientLogger.debug("[useDocument] Raw API response:", docData);
      const pagesArray = docData.pages as Array<Record<string, unknown>>;
      clientLogger.debug("[useDocument] First page:", pagesArray?.[0]);
      clientLogger.debug("[useDocument] First page elements:", pagesArray?.[0]?.elements);
      clientLogger.debug("[useDocument] First element:", (pagesArray?.[0]?.elements as unknown[])?.[0]);

      // Merge Redis-backed user elements with PDF-parsed elements. parse-from-s3
      // only sees what's baked into the binary, so anything queued in the last
      // few seconds before reload (debounce + apply + upload window) would be
      // lost without this merge. See mergeBackendElements above for the dedup.
      const parsedPages = docData.pages as unknown as PageObject[];
      // C — elements : la fusion Redis de chaque page incrémente la barre
      // sur [60, 92]. Le compteur `done` vit dans un finally pour rester exact
      // même quand une page échoue ; advanceProgress garantit la monotonie.
      const pagesTotal = parsedPages.length;
      let done = 0;
      advanceProgress({ phase: "elements", pagesTotal, pagesParsed: 0 });
      const recovery = await api.getDocumentElements(docId!);
      const mergedPages = parsedPages.map((page) => {
        const elements = mergeBackendElements(page.elements, (recovery.pages[String(page.pageNumber)] ?? []) as unknown as Element[]);
        done += 1;
        advanceProgress({ value: pagesTotal ? 60 + (done / pagesTotal) * 32 : 92, pagesParsed: done });
        return { ...page, elements };
      });
      /*
        Re-sort by pageNumber after the merge.

        Promise.all preserves the order of the INPUT array, not the order the
        requests complete, and this map is keyed by the page's position in
        `parsedPages` - so that part was fine. The real hazard is the opposite
        one: the parser can return a `pages` array that is not strictly
        ascending, and the editor renders `doc.pages` positionally. Any page
        that arrives out of order makes the canvas draw page N's elements on
        page M, which is exactly the reported "text lines moved onto the wrong
        pages" symptom on a 60-page document.
      */
      docData.pages = sortPagesByNumber(
        mergedPages,
      ) as unknown as Array<Record<string, unknown>>;

      // Convertir les données en types stricts
      // Note: API returns camelCase (by_alias=True)
      const metadata = docData.metadata || {};
      const rawData = docData as Record<string, unknown>;

      // Extract outlines (TOC/bookmarks)
      const outlines = (rawData.outlines || rawData.bookmarks || []) as BookmarkObject[];

      // Extract layers (OCG)
      const layers = (rawData.layers || []) as LayerObject[];

      // Extract embedded files
      const embeddedFiles = (rawData.embeddedFiles || rawData.embedded_files || []) as EmbeddedFileObject[];

      // Detected reading direction / dominant script (optional — omitted by the
      // parser when undecidable). Surfaced read-only in the editor + used to
      // pre-select the OCR writing system.
      const documentLanguage =
        (rawData.documentLanguage as DocumentLanguageInfo | undefined) ?? undefined;

      // Filter out placeholder values that some PDF libraries (e.g., ReportLab)
      // inject when no metadata was provided: "(anonymous)", "(unspecified)", etc.
      const isPlaceholderMetadata = (v: unknown): boolean => {
        if (typeof v !== "string") return true;
        const trimmed = v.trim();
        if (!trimmed) return true;
        return /^\(anonymous\)$|^\(unspecified\)$|^untitled$/i.test(trimmed);
      };
      const rawTitle = metadata.title as string | undefined;
      const titleFromMetadata = isPlaceholderMetadata(rawTitle) ? "" : rawTitle;

      const doc: DocumentObject = {
        documentId: (((docData as Record<string, unknown>).documentId as string | undefined) || docData.document_id || ""),
        metadata: {
          title: titleFromMetadata || docName || "Sans titre",
          author: (metadata.author as string) || null,
          subject: (metadata.subject as string) || null,
          keywords: (metadata.keywords as string[]) || [],
          creator: (metadata.creator as string) || null,
          producer: (metadata.producer as string) || null,
          creationDate: (metadata.creationDate as string) || (metadata.creation_date as string) || null,
          modificationDate: (metadata.modificationDate as string) || (metadata.modification_date as string) || null,
          /*
            The page count MUST come from the pages we actually parsed, never
            from the parser's metadata. The binary's own page_count is written
            at save time and can be stale: pasting a large block of text into a
            blank document grows the page count (1 -> 114+), but the metadata
            that travelled with the saved file still said 1. Trusting it made
            the editor render 1 page of real text plus a phantom "last page"
            that the engine had no text for - the "Unknown text" page. Trusting
            `docData.pages.length` also means the count can never disagree with
            the array the canvas iterates over, so a reopen after save shows
            exactly the pages that were saved.
          */
          pageCount: docData.pages.length,
          pdfVersion: (metadata.pdfVersion as string) || (metadata.pdf_version as string) || "1.4",
          isEncrypted: (metadata.isEncrypted as boolean) || (metadata.is_encrypted as boolean) || false,
          permissions: {
            print: true,
            modify: true,
            copy: true,
            annotate: true,
            fillForms: true,
            extract: true,
            assemble: true,
            printHighQuality: true,
          },
        },
        pages: docData.pages as unknown as PageObject[],
        outlines: outlines,
        namedDestinations: {},
        embeddedFiles: embeddedFiles,
        layers: layers,
        ...(documentLanguage ? { documentLanguage } : {}),
      };

      // D — building : assemblage final du scene graph.
      advanceProgress({ phase: "building", value: 92 });
      setDocument(doc);
      // Prefer filename (docName) over PDF title metadata when possible;
      // the PDF title may be a placeholder like "(anonymous)".
      setName(docName || doc.metadata.title || "");
      setCurrentPageIndex(0);
      advanceProgress({ value: 100 });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur de chargement";
      setError(message);
      setLoadProgress((prev) => ({ ...prev, phase: "error" }));
      clientLogger.error("use-document.load-failed", err);
    } finally {
      // Toujours arrêter l'estimateur (succès, erreur, ou retour anticipé).
      stopEstimator();
      setLoading(false);
    }
  }, [storedDocumentId, sessionDocumentId, flatten, advanceProgress, startAnalyzingEstimator, stopEstimator]);

  // Nettoyage de l'interval estimateur au démontage du hook.
  useEffect(() => {
    return () => stopEstimator();
  }, [stopEstimator]);

  // Charger au montage
  useEffect(() => {
    if (storedDocumentId || sessionDocumentId) {
      loadDocument();
    } else {
      setLoading(false);
    }
  }, [storedDocumentId, sessionDocumentId, loadDocument]);

  // Navigation entre pages
  const goToPage = useCallback(
    (pageIndex: number) => {
      if (document && pageIndex >= 0 && pageIndex < document.pages.length) {
        setCurrentPageIndex(pageIndex);
      }
    },
    [document]
  );

  // Ajouter une nouvelle page
  const addPage = useCallback(() => {
    if (!document) return;

    const newPage: PageObject = {
      pageId: generatePageId(),
      pageNumber: document.pages.length + 1,
      dimensions: {
        width: 612, // Letter size in points
        height: 792,
        rotation: 0,
      },
      mediaBox: {
        x: 0,
        y: 0,
        width: 612,
        height: 792,
      },
      cropBox: null,
      elements: [],
      preview: {
        thumbnailUrl: null,
        fullUrl: null,
      },
    };

    const updatedPages = [...document.pages, newPage];

    setDocument({
      ...document,
      pages: updatedPages,
      metadata: {
        ...document.metadata,
        pageCount: updatedPages.length,
      },
    });

    setDirty(true);
    // Naviguer vers la nouvelle page
    setCurrentPageIndex(updatedPages.length - 1);
  }, [document]);

  // Supprimer une page
  const deletePage = useCallback(
    (pageIndex: number) => {
      if (!document || document.pages.length <= 1) return;
      if (pageIndex < 0 || pageIndex >= document.pages.length) return;

      const updatedPages = document.pages
        .filter((_, index) => index !== pageIndex)
        .map((page, index) => ({
          ...page,
          pageNumber: index + 1,
        }));

      setDocument({
        ...document,
        pages: updatedPages,
        metadata: {
          ...document.metadata,
          pageCount: updatedPages.length,
        },
      });

      setDirty(true);

      // Ajuster l'index de la page actuelle si nécessaire
      if (currentPageIndex >= updatedPages.length) {
        setCurrentPageIndex(updatedPages.length - 1);
      } else if (currentPageIndex > pageIndex) {
        setCurrentPageIndex(currentPageIndex - 1);
      }
    },
    [document, currentPageIndex]
  );

  // Réordonner les pages
  const reorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!document) return;
      if (
        fromIndex < 0 ||
        fromIndex >= document.pages.length ||
        toIndex < 0 ||
        toIndex >= document.pages.length
      ) {
        return;
      }

      const updatedPages = [...document.pages];
      const [movedPage] = updatedPages.splice(fromIndex, 1);
      if (!movedPage) return;
      updatedPages.splice(toIndex, 0, movedPage);

      // Mettre à jour les numéros de page
      const renumberedPages = updatedPages.map((page, index) => ({
        ...page,
        pageNumber: index + 1,
      }));

      setDocument({
        ...document,
        pages: renumberedPages,
      });

      setDirty(true);

      // Ajuster l'index de la page actuelle
      if (currentPageIndex === fromIndex) {
        setCurrentPageIndex(toIndex);
      } else if (fromIndex < currentPageIndex && toIndex >= currentPageIndex) {
        setCurrentPageIndex(currentPageIndex - 1);
      } else if (fromIndex > currentPageIndex && toIndex <= currentPageIndex) {
        setCurrentPageIndex(currentPageIndex + 1);
      }
    },
    [document, currentPageIndex]
  );

  // Dupliquer une page
  const duplicatePage = useCallback(
    (pageIndex: number) => {
      if (!document) return;
      if (pageIndex < 0 || pageIndex >= document.pages.length) return;

      const pageToDuplicate = document.pages[pageIndex];
      if (!pageToDuplicate) return;

      // Créer une copie profonde de la page avec un nouvel ID
      const duplicatedPage: PageObject = {
        ...JSON.parse(JSON.stringify(pageToDuplicate)),
        pageId: generatePageId(),
        pageNumber: pageIndex + 2,
        elements: pageToDuplicate.elements.map((element) => ({
          ...element,
          elementId: `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        })),
      };

      // Insérer la page dupliquée après l'originale
      const updatedPages = [
        ...document.pages.slice(0, pageIndex + 1),
        duplicatedPage,
        ...document.pages.slice(pageIndex + 1),
      ].map((page, index) => ({
        ...page,
        pageNumber: index + 1,
      }));

      setDocument({
        ...document,
        pages: updatedPages,
        metadata: {
          ...document.metadata,
          pageCount: updatedPages.length,
        },
      });

      setDirty(true);

      // Naviguer vers la page dupliquée
      setCurrentPageIndex(pageIndex + 1);
    },
    [document]
  );

  // Ajouter un élément au scene graph d'une page (miroir du canvas Fabric)
  //
  // IDEMPOTENT. A single paste can drive the same elementId through this twice:
  // the text-pagination path re-enters `handleElementAdded` after a re-parse /
  // save cycle, and a retried `createElement` re-delivers the element. A plain
  // append stacked the second copy on the first, which renders as two texts
  // drawn over each other on the same page - and the next save then bakes BOTH,
  // so the duplication survives a reload. `elementId` is unique per element, so
  // an existing id means "already there": update it in place instead.
  const addElementToPage = useCallback(
    (pageIndex: number, element: Element) => {
      setDocument((prev) => {
        if (!prev || pageIndex < 0 || pageIndex >= prev.pages.length) return prev;
        // Already present on ANY page: never add a second copy, and never
        // leave the same elementId stranded on two pages.
        const owner = prev.pages.findIndex((p) =>
          p.elements.some((e) => e.elementId === element.elementId),
        );
        if (owner >= 0) {
          if (owner === pageIndex) {
            const current = prev.pages[owner]!;
            const idx = current.elements.findIndex(
              (e) => e.elementId === element.elementId,
            );
            const elements = [...current.elements];
            elements[idx] = element;
            const pages = [...prev.pages];
            pages[owner] = { ...current, elements };
            return { ...prev, pages };
          }
          return prev;
        }
        const pages = prev.pages.map((p, i) =>
          i === pageIndex
            ? { ...p, elements: [...p.elements, element] }
            : p,
        );
        return { ...prev, pages };
      });
    },
    [],
  );

  // Mettre à jour un élément (cherche dans toutes les pages)
  const updateElementInPage = useCallback(
    (elementId: string, updates: Partial<Element>) => {
      setDocument((prev) => {
        if (!prev) return prev;
        let touched = false;
        const pages = prev.pages.map((p) => {
          const idx = p.elements.findIndex((e) => e.elementId === elementId);
          if (idx === -1) return p;
          touched = true;
          const nextEl = { ...p.elements[idx], ...updates } as Element;
          const elements = [...p.elements];
          elements[idx] = nextEl;
          return { ...p, elements };
        });
        return touched ? { ...prev, pages } : prev;
      });
    },
    [],
  );

  // Retirer un élément (cherche dans toutes les pages)
  const removeElementFromPage = useCallback((elementId: string) => {
    setDocument((prev) => {
      if (!prev) return prev;
      let touched = false;
      const pages = prev.pages.map((p) => {
        const filtered = p.elements.filter((e) => e.elementId !== elementId);
        if (filtered.length === p.elements.length) return p;
        touched = true;
        return { ...p, elements: filtered };
      });
      return touched ? { ...prev, pages } : prev;
    });
  }, []);

  // ---- Calques utilisateur (Phase 2 "Layer Groups") ----

  // Créer un calque : ajouté en haut de la pile (order = max+1).
  const createLayer = useCallback((name: string): LayerObject => {
    const layer: LayerObject = {
      layerId: generateLayerId(),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      print: true,
      order: 0, // recalculé ci-dessous (max+1) dans le setter
    };
    setUserLayers((prev) => {
      const maxOrder = prev.reduce((max, l) => (l.order > max ? l.order : max), -1);
      return [...prev, { ...layer, order: maxOrder + 1 }];
    });
    setDirty(true);
    return layer;
  }, []);

  // Supprimer un calque + détacher (layerId=null) tous ses éléments membres.
  const deleteLayer = useCallback((layerId: string) => {
    setUserLayers((prev) => prev.filter((l) => l.layerId !== layerId));
    setDocument((prev) => {
      if (!prev) return prev;
      let touched = false;
      const pages = prev.pages.map((p) => {
        let pageTouched = false;
        const elements = p.elements.map((el) => {
          if (el.layerId === layerId) {
            pageTouched = true;
            return { ...el, layerId: null };
          }
          return el;
        });
        if (!pageTouched) return p;
        touched = true;
        return { ...p, elements };
      });
      return touched ? { ...prev, pages } : prev;
    });
    setDirty(true);
  }, []);

  const renameLayer = useCallback((layerId: string, name: string) => {
    setUserLayers((prev) =>
      prev.map((l) => (l.layerId === layerId ? { ...l, name } : l)),
    );
    setDirty(true);
  }, []);

  const reorderLayer = useCallback((layerId: string, newOrder: number) => {
    setUserLayers((prev) =>
      prev.map((l) => (l.layerId === layerId ? { ...l, order: newOrder } : l)),
    );
    setDirty(true);
  }, []);

  // Masquer/afficher un calque — cascade sur element.visible des membres
  // (un seul passage de re-render sur les pages, pas N appels).
  const setLayerVisible = useCallback((layerId: string, visible: boolean) => {
    setUserLayers((prev) =>
      prev.map((l) => (l.layerId === layerId ? { ...l, visible } : l)),
    );
    setDocument((prev) => {
      if (!prev) return prev;
      let touched = false;
      const pages = prev.pages.map((p) => {
        let pageTouched = false;
        const elements = p.elements.map((el) => {
          if (el.layerId === layerId) {
            pageTouched = true;
            return { ...el, visible };
          }
          return el;
        });
        if (!pageTouched) return p;
        touched = true;
        return { ...p, elements };
      });
      return touched ? { ...prev, pages } : prev;
    });
    setDirty(true);
  }, []);

  const setLayerLocked = useCallback((layerId: string, locked: boolean) => {
    setUserLayers((prev) =>
      prev.map((l) => (l.layerId === layerId ? { ...l, locked } : l)),
    );
    setDocument((prev) => {
      if (!prev) return prev;
      let touched = false;
      const pages = prev.pages.map((p) => {
        let pageTouched = false;
        const elements = p.elements.map((el) => {
          if (el.layerId === layerId) {
            pageTouched = true;
            return { ...el, locked };
          }
          return el;
        });
        if (!pageTouched) return p;
        touched = true;
        return { ...p, elements };
      });
      return touched ? { ...prev, pages } : prev;
    });
    setDirty(true);
  }, []);

  // Affecter un élément à un calque (ou le détacher avec null).
  const assignElementToLayer = useCallback(
    (elementId: string, layerId: string | null) => {
      updateElementInPage(elementId, { layerId } as Partial<Element>);
      setDirty(true);
    },
    [updateElementInPage],
  );

  // Restaure (cross-session) les calques utilisateur + le membership en un
  // seul batch. Appelé une fois après le parse (cf. page.tsx). Ne marque PAS
  // le document comme dirty : une restauration n'est pas une édition (sinon on
  // déclencherait une sauvegarde immédiate juste après le chargement).
  const restoreLayers = useCallback(
    (restoredLayers: LayerObject[], membership: Record<string, string>) => {
      setUserLayers(restoredLayers);
      // Index par layerId pour cascader visible/locked depuis le calque.
      const layerById = new Map(restoredLayers.map((l) => [l.layerId, l]));
      setDocument((prev) => {
        if (!prev) return prev;
        let touched = false;
        const pages = prev.pages.map((p) => {
          let pageTouched = false;
          const elements = p.elements.map((el) => {
            const layerId = membership[el.elementId];
            if (layerId === undefined) return el;
            const layer = layerById.get(layerId);
            if (!layer) return el;
            pageTouched = true;
            // Le membership porte aussi l'effet visible/locked du calque sur
            // ses membres (cohérent avec setLayerVisible/setLayerLocked).
            return {
              ...el,
              layerId,
              visible: layer.visible,
              locked: layer.locked,
            };
          });
          if (!pageTouched) return p;
          touched = true;
          return { ...p, elements };
        });
        return touched ? { ...prev, pages } : prev;
      });
    },
    [],
  );

  // Remplace les pages du scene graph. Utilisé après un re-parse du PDF
  // (rotate/add/delete/reorder modifient le layout, donc les coords des
  // text items changent — il faut refeed le canvas avec les nouveaux
  // bounds pour que les textes/images soient positionnés correctement).
  const replacePages = useCallback((newPages: PageObject[]) => {
    setDocument((prev) => {
      if (!prev) return prev;
      // Callers supply document order; old page numbers must never reorder
      // pages that were just inserted, moved or duplicated.
      const renumbered = renumberPages(newPages);
      return {
        ...prev,
        pages: renumbered,
        metadata: {
          ...prev.metadata,
          pageCount: renumbered.length,
        },
      };
    });
  }, []);

  // Pages du document
  const pages = document?.pages || [];
  const currentPage = pages[currentPageIndex] || null;

  // Outlines, layers, embedded files
  const outlines = document?.outlines || [];
  const layers = document?.layers || [];
  const documentLanguage = document?.documentLanguage;
  const embeddedFiles = document?.embeddedFiles || [];

  return {
    document,
    name,
    pages,
    currentPage,
    currentPageIndex,
    loading,
    loadProgress,
    error,
    documentId,
    storedDocumentId: storedId,
    goToPage,
    reload: loadDocument,
    isDirty,
    setDirty,
    addPage,
    deletePage,
    reorderPages,
    duplicatePage,
    addElementToPage,
    updateElementInPage,
    removeElementFromPage,
    replacePages,
    setName,
    outlines,
    documentLanguage,
    layers,
    userLayers,
    createLayer,
    deleteLayer,
    renameLayer,
    reorderLayer,
    setLayerVisible,
    setLayerLocked,
    assignElementToLayer,
    restoreLayers,
    embeddedFiles,
    flattenedPdfFile,
  };
}
