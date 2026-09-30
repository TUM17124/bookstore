import { api } from "@/lib/pdf-editor/api";
import { apiClient } from '../client';
import type { LayerObject } from '@giga-pdf/types';

/**
 * Cross-session persistence payload for editor user layers.
 *
 * - `layers`     : the editor-only "Layer Groups" (NOT PDF OCG layers).
 * - `membership` : maps a (deterministic) elementId → the layerId it belongs to.
 *                  Keyed by elementId so it re-attaches after the editor
 *                  re-parses the PDF on open (P1 made elementIds deterministic).
 */
export interface DocumentLayersData {
  layers: LayerObject[];
  membership: Record<string, string>;
}

/**
 * Document layers service — persists editor user layers + element→layer
 * membership against the STORED document id (survives reloads).
 *
 * Backend endpoints: /storage/documents/{storedDocumentId}/layers
 */
export const documentLayersService = {
  getDocumentLayers: (id: string): Promise<DocumentLayersData> => api.getDocumentLayers(id),
  putDocumentLayers: (id: string, data: DocumentLayersData): Promise<DocumentLayersData> => api.putDocumentLayers(id, data),
};
