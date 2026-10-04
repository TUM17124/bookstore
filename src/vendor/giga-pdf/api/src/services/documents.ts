import { apiClient } from '../client';
import type {
  Document,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  PaginatedResponse,
  DocumentListParams,
} from '@giga-pdf/types';

/**
 * Document service
 *
 * Storage CRUD (persistent documents): /storage/documents
 * Core document operations: /documents/{id}
 */
export const documentService = {
  /**
   * List documents with pagination and filtering
   * Backend: GET /storage/documents
   */
  list: async (params?: DocumentListParams): Promise<PaginatedResponse<Document>> => {
    const response = await apiClient.get<PaginatedResponse<Document>>('/storage/documents', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single document by ID
   * Backend: GET /documents/{document_id}
   */
  get: async (id: string): Promise<Document> => {
    const response = await apiClient.get<Document>(`/documents/${id}`);
    return response.data;
  },

  /**
   * Create a new document record in storage
   * Backend: POST /storage/documents
   */
  create: async (data: CreateDocumentRequest): Promise<Document> => {
    const response = await apiClient.post<Document>('/storage/documents', data);
    return response.data;
  },

  /**
   * Update a document metadata
   * Backend: PATCH /storage/documents/{id}
   */
  update: async (id: string, data: UpdateDocumentRequest): Promise<Document> => {
    const response = await apiClient.patch<Document>(`/storage/documents/${id}`, data);
    return response.data;
  },

  /**
   * Delete a document
   * Backend: DELETE /documents/{document_id}
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/documents/${id}`);
  },

  /**
   * Duplicate a document
   * TODO: Backend endpoint not yet implemented
   */
  duplicate: async (id: string, title?: string): Promise<Document> => {
    const response = await apiClient.post<Document>(`/documents/${id}/duplicate`, {
      title,
    });
    return response.data;
  },

  /**
   * Get document activity history
   * Backend: GET /activity/documents/{document_id}/history
   */
  getHistory: async (id: string): Promise<unknown[]> => {
    const response = await apiClient.get<unknown[]>(`/activity/documents/${id}/history`);
    return response.data;
  },

  /**
   * Restore document to a specific version
   * Backend: POST /storage/documents/{id}/versions (create version to restore)
   * TODO: Backend endpoint for restore not yet implemented — using version creation as closest match
   */
  restoreVersion: async (id: string, versionId: string): Promise<Document> => {
    const response = await apiClient.post<Document>(`/storage/documents/${id}/versions`, {
      version_id: versionId,
    });
    return response.data;
  },
};
