import uuid

from django.core.paginator import Paginator
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    EditorDocument, EditorPage, EditorLayer, EditorElement, EditorOcrBlock,
    UserSignatureMark, SiteSettings,
)
from .serializers import (
    StoredDocumentSerializer,
    EditorElementResponseSerializer,
    UserSignatureMarkSerializer,
    ELEMENT_PROP_KEYS,
)

# Default page geometry for pages synthesized on first element-touch. Actual
# page dimensions come from the Next.js/WASM PDF-parsing layer (task 6), not
# from any Django-owned endpoint - the real call surface never sends page
# geometry to Django, only page NUMBERS. A4 in points matches the value the
# rest of this migration already uses as a placeholder elsewhere.
DEFAULT_PAGE_WIDTH_PT = 595.28
DEFAULT_PAGE_HEIGHT_PT = 841.89


def envelope(data, request_id=None):
    return {
        "success": True,
        "data": data,
        "meta": {
            "request_id": request_id or str(uuid.uuid4()),
            "timestamp": timezone.now().isoformat(),
        },
    }


def owned_documents(user):
    return EditorDocument.objects.filter(owner=user, is_deleted=False)


def user_storage_usage_bytes(user, exclude_document_id=None):
    """Total disk usage (current file + kept original, for restore-original)
    across all of a user's non-deleted documents. Live `.size` stats rather
    than a denormalised counter - no version-history table exists (versions
    overwrite in place, see CreateVersionView), so this is always exact, and
    typical per-user document counts make the extra stat() calls cheap.
    `exclude_document_id` omits one document (the one about to be replaced)
    so a version-overwrite can compute its "usage after this save" cleanly.
    """
    qs = owned_documents(user)
    if exclude_document_id is not None:
        qs = qs.exclude(pk=exclude_document_id)
    total = 0
    for doc in qs.only("file", "original_file"):
        try:
            if doc.file:
                total += doc.file.size
        except (ValueError, OSError):
            pass
        try:
            if doc.original_file:
                total += doc.original_file.size
        except (ValueError, OSError):
            pass
    return total


def storage_cap_bytes():
    """0 means unlimited (admin can turn the cap off via Site settings)."""
    cap_mb = SiteSettings.get().pdf_editor_storage_cap_mb
    return cap_mb * 1024 * 1024 if cap_mb > 0 else 0


def _count_pdf_pages(file_obj) -> int:
    """Best-effort page count for a Django-managed PDF FileField.

    Returns 0 when the file cannot be parsed - a wrong count must never
    block an upload or a save.

    CRITICAL: this helper is a PEEK, not a consume. Both call sites
    (DocumentListView.post for a new upload, CreateVersionView.post for a
    re-save) go on to hand the SAME request.FILES object to
    `document.file.save(...)` / `document.original_file.save(...)` right after
    calling this. The previous version called `file_obj.open("rb")` and then
    `file_obj.close()` in its `finally` block, which CLOSED the underlying
    TemporaryUploadedFile that Django is still holding. Every one of those saves
    then died with:

        ValueError: I/O operation on closed file.

    which surfaced to the user as HTTP 500 on upload, on every save, and - via
    CreateVersionView - on the version list, so the editor could neither create
    a document nor open the ones that already existed.

    A Django FieldFile opened with .open() is closed again by .close(), so this
    closed the upload just as surely. Reading through seek(0) and NEVER closing
    is what makes the helper safe to share with the caller.
    """
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - pypdf is a hard requirement
        return 0
    try:
        # Read through a rewind instead of open()/close(). The caller still
        # needs this stream afterwards, so it must be left exactly as we found
        # it: positioned at 0, still open.
        if hasattr(file_obj, "seek"):
            file_obj.seek(0)
        elif hasattr(file_obj, "file") and hasattr(file_obj.file, "seek"):
            file_obj.file.seek(0)
        return len(PdfReader(file_obj).pages)
    except Exception:
        return 0
    finally:
        # Rewind for the caller's save() - never close it.
        try:
            if hasattr(file_obj, "seek"):
                file_obj.seek(0)
            elif hasattr(file_obj, "file") and hasattr(file_obj.file, "seek"):
                file_obj.file.seek(0)
        except Exception:
            pass

def get_or_create_page(document, page_number):
    page, _ = EditorPage.objects.get_or_create(
        document=document,
        page_number=page_number,
        defaults={
            "width": DEFAULT_PAGE_WIDTH_PT,
            "height": DEFAULT_PAGE_HEIGHT_PT,
            "media_box": {"x": 0, "y": 0, "width": DEFAULT_PAGE_WIDTH_PT, "height": DEFAULT_PAGE_HEIGHT_PT},
        },
    )
    return page


def apply_element_fields(element, data, creating=False):
    """Mutate `element` in place from an ElementCreateRequest-shaped dict.
    Shared by create and update (update only applies keys actually present)."""
    if creating or "bounds" in data:
        element.bounds = data.get("bounds", element.bounds or {})
    if creating or "transform" in data:
        element.transform = data.get("transform", element.transform or {})
    if "locked" in data:
        element.locked = bool(data["locked"])
    if "visible" in data:
        element.visible = bool(data["visible"])
    if creating or "layer_id" in data:
        layer_id = data.get("layer_id")
        element.layer = None
        if layer_id:
            element.layer = EditorLayer.objects.filter(id=layer_id, document_id=element.page.document_id).first()

    props = dict(element.props or {})
    for key in ELEMENT_PROP_KEYS:
        if key in data:
            props[key] = data[key]
    element.props = props


# ===== Storage/Documents API =====

class DocumentsView(APIView):
    """GET/POST /api/editor/documents/ - matches api.ts listDocuments()/
    saveDocument(). Folder organization is out of scope (no folder UI in the
    migrated editor - folder_id always serializes to null), so `folder_id`
    is accepted and silently ignored rather than filtered on."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def get(self, request):
        qs = owned_documents(request.user)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)

        tag = request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__contains=[tag])

        try:
            page_num = max(1, int(request.query_params.get("page", 1)))
        except (TypeError, ValueError):
            page_num = 1
        try:
            per_page = min(100, max(1, int(request.query_params.get("per_page", 20))))
        except (TypeError, ValueError):
            per_page = 20

        paginator = Paginator(qs, per_page)
        page_obj = paginator.get_page(page_num)

        items = StoredDocumentSerializer(
            page_obj.object_list, many=True, context={"request": request}
        ).data

        cap = storage_cap_bytes()
        return Response(envelope({
            "items": items,
            "pagination": {
                "total": paginator.count,
                "page": page_obj.number,
                "per_page": per_page,
                "total_pages": paginator.num_pages,
            },
            "storage": {
                "used_bytes": user_storage_usage_bytes(request.user),
                "cap_bytes": cap,
            },
        }))

    def post(self, request):
        file_obj = request.FILES.get("file")
        name = request.data.get("name") or "Untitled"
        if not file_obj:
            return Response({"detail": "file is required"}, status=400)

        cap = storage_cap_bytes()
        if cap > 0:
            projected = user_storage_usage_bytes(request.user) + file_obj.size
            if projected > cap:
                return Response({
                    "detail": "Storage limit reached. Delete a document or upgrade to save more.",
                    "code": "storage_cap_exceeded",
                    "used_bytes": projected - file_obj.size,
                    "cap_bytes": cap,
                }, status=413)

        tags_raw = request.data.get("tags")
        tags = []
        if tags_raw:
            import json
            try:
                tags = json.loads(tags_raw)
            except (ValueError, TypeError):
                tags = []

        page_count = _count_pdf_pages(file_obj)
        document = EditorDocument.objects.create(
            owner=request.user,
            name=name,
            file=file_obj,
            tags=tags,
            page_count=page_count,
            current_version=1,
        )
        # original_file preserved separately for restoreOriginalDocument;
        # save() again since FileField assignment above already wrote `file`.
        file_obj.seek(0)
        document.original_file.save(file_obj.name, file_obj, save=True)

        return Response(envelope({
            "stored_document_id": str(document.id),
            "name": document.name,
            "page_count": document.page_count,
            "version_number": document.current_version,
            "created_at": document.created_at.isoformat(),
        }), status=201)


class UserSignaturesView(APIView):
    """GET/POST/DELETE /api/editor/signatures/ - matches user-signatures.ts's
    fetchUserSignatures() and the Sign tool's "save to account" checkbox.
    Ported from a stub that pointed at GigaPDF's original (never-migrated)
    Next.js /api/user/signatures route - this is its real replacement."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        marks = UserSignatureMark.objects.filter(owner=request.user)
        return Response({"signatures": UserSignatureMarkSerializer(marks, many=True).data})

    def post(self, request):
        kind = request.data.get("kind")
        data_url = request.data.get("dataUrl")
        width = request.data.get("width")
        height = request.data.get("height")
        if kind not in ("signature", "initials") or not data_url or not width or not height:
            return Response({"detail": "kind, dataUrl, width and height are required"}, status=400)
        try:
            width = int(width)
            height = int(height)
        except (TypeError, ValueError):
            return Response({"detail": "width/height must be integers"}, status=400)

        mark = UserSignatureMark.objects.create(
            owner=request.user, kind=kind, data_url=data_url, width=width, height=height,
        )
        return Response(UserSignatureMarkSerializer(mark).data, status=201)

    def delete(self, request):
        mark_id = request.query_params.get("id")
        if not mark_id:
            return Response({"detail": "id is required"}, status=400)
        UserSignatureMark.objects.filter(owner=request.user, id=mark_id).delete()
        return Response(status=204)


class DocumentDetailView(APIView):
    """GET/PATCH/DELETE /api/editor/documents/<id>/ - matches
    getStoredDocument / updateStoredDocument+renameDocument / deleteDocument."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        return Response(envelope(
            StoredDocumentSerializer(document, context={"request": request}).data
        ))

    def patch(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        if "name" in request.data:
            document.name = request.data["name"]
        if "tags" in request.data:
            document.tags = request.data["tags"]
        document.save()
        return Response(envelope({
            "stored_document_id": str(document.id),
            "name": document.name,
            "tags": document.tags,
            "updated_at": document.modified_at.isoformat(),
        }))

    def delete(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        permanent = request.query_params.get("permanent") == "true"
        if permanent:
            document.file.delete(save=False)
            document.original_file.delete(save=False)
            document.thumbnail.delete(save=False)
            document.delete()
        else:
            document.is_deleted = True
            document.save(update_fields=["is_deleted", "modified_at"])
        return Response(envelope({"deleted": True, "permanent": permanent}))


class DownloadDocumentView(APIView):
    """GET /api/editor/documents/<id>/download/ - matches
    getDocumentDownloadUrl() and the raw fetch in use-document-save.ts."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(
            EditorDocument.objects.filter(owner=request.user), pk=pk
        )
        # A missing file used to raise FileNotFoundError straight out of
        # FieldFile.open(), i.e. an unhandled 500. Documents saved by the
        # closed-file bug above are still listed in the DB while their bytes
        # were never written, so this is a real state users can reach. 404 with
        # a clear message is the honest answer: there is nothing to open.
        try:
            handle = document.file.open("rb")
        except (FileNotFoundError, OSError, ValueError):
            return Response(
                {
                    "detail": "This document's file is missing from storage. "
                              "Upload the document again.",
                    "code": "file_missing",
                },
                status=404,
            )
        return FileResponse(handle, content_type="application/pdf")


class LoadDocumentView(APIView):
    """POST /api/editor/documents/<id>/load/ - matches loadDocument().
    No separate Redis-backed edit session exists in this simplified,
    single-user architecture - document_id and stored_document_id are the
    same EditorDocument UUID."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        return Response(envelope({
            "document_id": str(document.id),
            "stored_document_id": str(document.id),
            "name": document.name,
            "page_count": document.page_count,
        }))


class CreateVersionView(APIView):
    """POST /api/editor/documents/<id>/versions/ - matches
    createDocumentVersion(). No separate version-history rows are kept (no
    version-browsing UI exists in the migrated editor) - this overwrites the
    current file and bumps the version counter."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "file is required"}, status=400)

        cap = storage_cap_bytes()
        if cap > 0:
            # This document's OWN current usage is excluded first — its file
            # is about to be replaced (and original_file, if any, is kept
            # unchanged), so re-saving a same-size document must never be
            # blocked by its own existing bytes.
            projected = (
                user_storage_usage_bytes(request.user, exclude_document_id=document.pk)
                + (document.original_file.size if document.original_file else 0)
                + file_obj.size
            )
            if projected > cap:
                return Response({
                    "detail": "Storage limit reached. Delete a document or upgrade to save more.",
                    "code": "storage_cap_exceeded",
                    "used_bytes": projected - file_obj.size,
                    "cap_bytes": cap,
                }, status=413)

        page_count = _count_pdf_pages(file_obj)
        document.file.delete(save=False)
        document.file.save(file_obj.name, file_obj, save=False)
        document.current_version += 1
        document.page_count = page_count
        document.save()

        return Response(envelope({
            "stored_document_id": str(document.id),
            "version": document.current_version,
            "created_at": document.modified_at.isoformat(),
        }))


class RestoreOriginalView(APIView):
    """POST /api/editor/documents/<id>/restore-original/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        if document.current_version <= 1 or not document.original_file:
            return Response(envelope({
                "stored_document_id": str(document.id),
                "current_version": document.current_version,
                "restored_from": document.current_version,
                "noop": True,
            }))

        restored_from = document.current_version
        document.original_file.open("rb")
        content = document.original_file.read()
        document.original_file.seek(0)
        document.file.delete(save=False)
        from django.core.files.base import ContentFile
        document.file.save("restored.pdf", ContentFile(content), save=False)
        document.current_version += 1
        document.save()

        return Response(envelope({
            "stored_document_id": str(document.id),
            "current_version": document.current_version,
            "restored_from": restored_from,
            "page_count": document.page_count,
            "created_at": document.modified_at.isoformat(),
        }))


class ThumbnailUploadView(APIView):
    """POST /api/editor/documents/<id>/thumbnail/."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "file is required"}, status=400)
        document.thumbnail.delete(save=False)
        document.thumbnail.save(file_obj.name, file_obj, save=True)
        url = document.thumbnail.url
        return Response(envelope({
            "thumbnail_url": request.build_absolute_uri(url) if url else None,
        }))


class OcrBlocksView(APIView):
    """POST /api/editor/documents/<id>/ocr-blocks/ - matches indexOcrBlocks().
    No semantic search is implemented - the frontend only reads the
    `semantic_search_available` flag, never calls search itself."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        blocks = request.data.get("blocks") or []
        objs = [
            EditorOcrBlock(
                document=document,
                page=block.get("page", 1),
                text=block.get("text", ""),
                bbox=block.get("bbox"),
            )
            for block in blocks
        ]
        EditorOcrBlock.objects.bulk_create(objs)
        return Response(envelope({
            "stored_document_id": str(document.id),
            "blocks_indexed": len(objs),
            "semantic_search_available": False,
        }))


# ===== Elements API =====

class PageElementsView(APIView):
    """GET/POST /api/editor/documents/<id>/pages/<page_number>/elements/ -
    matches getPageElements() / createElement()."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, page_number):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        page = EditorPage.objects.filter(document=document, page_number=page_number).first()
        elements = page.elements.all() if page else EditorElement.objects.none()
        elem_type = request.query_params.get("type")
        if elem_type:
            elements = elements.filter(type=elem_type)
        data = EditorElementResponseSerializer(elements, many=True).data
        return Response(envelope({
            "elements": data,
            "pagination": {"total": len(data), "page": 1, "per_page": len(data) or 1, "total_pages": 1},
        }))

    def post(self, request, pk, page_number):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        page = get_or_create_page(document, page_number)
        element = EditorElement(page=page, type=request.data.get("type", EditorElement.TEXT))
        apply_element_fields(element, request.data, creating=True)
        element.save()
        return Response(envelope(EditorElementResponseSerializer(element).data), status=201)


class ElementDetailView(APIView):
    """PATCH/DELETE /api/editor/elements/<id>/ - matches
    updateElement()/deleteElement()."""

    permission_classes = [IsAuthenticated]

    def _get_element(self, request, element_id, document_pk=None):
        qs = EditorElement.objects.filter(page__document__owner=request.user)
        if document_pk:
            qs = qs.filter(page__document_id=document_pk)
        return get_object_or_404(qs, pk=element_id)

    def patch(self, request, pk, element_id):
        element = self._get_element(request, element_id, document_pk=pk)
        apply_element_fields(element, request.data, creating=False)
        element.save()
        return Response(envelope(EditorElementResponseSerializer(element).data))

    def delete(self, request, pk, element_id):
        element = self._get_element(request, element_id, document_pk=pk)
        element.delete()
        return Response(status=204)


class BatchElementsView(APIView):
    """POST /api/editor/documents/<id>/elements/batch/ - matches
    batchElementOperations()."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        document = get_object_or_404(owned_documents(request.user), pk=pk)
        operations = request.data.get("operations") or []
        results = []
        failed_count = 0

        for op in operations:
            action = op.get("action")
            try:
                if action == "create":
                    page = get_or_create_page(document, op.get("page_number", 1))
                    element = EditorElement(page=page, type=(op.get("data") or {}).get("type", EditorElement.TEXT))
                    apply_element_fields(element, op.get("data") or {}, creating=True)
                    element.save()
                    results.append({"success": True, "element_id": str(element.id)})
                elif action == "update":
                    element = EditorElement.objects.get(
                        id=op.get("element_id"), page__document=document
                    )
                    apply_element_fields(element, op.get("data") or {}, creating=False)
                    element.save()
                    results.append({"success": True, "element_id": str(element.id)})
                elif action == "delete":
                    EditorElement.objects.filter(
                        id=op.get("element_id"), page__document=document
                    ).delete()
                    results.append({"success": True, "element_id": op.get("element_id")})
                else:
                    failed_count += 1
                    results.append({"success": False, "error": f"unknown action: {action}"})
            except Exception as exc:  # noqa: BLE001 - one failed op must not abort the batch
                failed_count += 1
                results.append({"success": False, "element_id": op.get("element_id"), "error": str(exc)})

        return Response(envelope({"results": results, "failed_count": failed_count}))
