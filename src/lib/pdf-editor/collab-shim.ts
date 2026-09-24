// Real-time collaboration (multi-user cursors, element locks, live
// reload-on-save) is out of scope for this migration - see
// bookstore/docs/GIGAPDF_EDITOR_MIGRATION_PLAN.md. GigaPDF's actual
// socketClient, SocketEventData, useCollaboration, useCollaborationStore,
// and useElementUpdates were removed when @giga-pdf/api and @giga-pdf/editor
// were vendored (their websocket code lived in packages/api/src/websocket).
// This module stands in for all of them so the many call sites throughout
// the editor route (written assuming collaboration exists, same as real
// GigaPDF) keep compiling and behave as "no one else is ever connected" -
// correct, not a workaround, since there IS no other connected user.
// Wire-format field names (snake_case) match what the real handler code
// destructures, i.e. GigaPDF's actual FastAPI socket payload shape.

import type { Element } from "@giga-pdf/types";

export type SocketEventData = {
  "element:locked": {
    element_id: string;
    locked_by_user_id: string;
    locked_by_user_name?: string;
    expires_at?: string;
  };
  "element:unlocked": { element_id: string };
  "element:create": {
    element_id?: string;
    client_id?: string;
    element?: Element;
    page_number?: number;
  };
  "element:update": {
    element_id?: string;
    client_id?: string;
    changes?: Partial<Element>;
  };
  "element:delete": { element_id?: string; client_id?: string };
};

export const socketClient = {
  isConnected: () => false,
  getClientId: () => null as string | null,
  emit: (_event: string, _payload?: unknown) => {},
  on: (_event: string, _handler: (...args: unknown[]) => void) => {},
  off: (_event: string, _handler?: (...args: unknown[]) => void) => {},
};

export type UseCollaborationOptions = {
  documentId: string | null;
  enabled: boolean;
  onDocumentBinaryUpdate?: (...args: unknown[]) => void;
  onElementLocked?: (data: SocketEventData["element:locked"]) => void;
  onElementUnlocked?: (data: SocketEventData["element:unlocked"]) => void;
};

export function useCollaboration(_options: UseCollaborationOptions) {
  return {
    collaborators: [] as Array<{ id: string; name: string }>,
    cursors: new Map<string, { x: number; y: number }>(),
    sendCursorPosition: (_pos: { x: number; y: number }, _pageId: string) => {},
    collaboratorCount: 0,
    isConnected: false,
    emitBinaryUpdate: (_version: number) => {},
    emitElementUpdate: (_elementId: string, _changes: Partial<Element>) => {},
    emitElementDelete: (_elementId: string) => {},
    emitElementLock: (_elementId: string) => {},
    emitElementUnlock: (_elementId: string) => {},
  };
}

export function useCollaborationStore<T>(
  selector: (state: {
    elementLocks: Map<string, { lockedBy: string; lockedByName?: string }>;
    lockElement: (elementId: string, lockedBy: string, lockedByName?: string) => void;
    unlockElement: (elementId: string) => void;
  }) => T,
): T {
  return selector({
    elementLocks: new Map(),
    lockElement: () => {},
    unlockElement: () => {},
  });
}

export function useElementUpdates(
  _documentId: string | null,
  _onCreate: (data: SocketEventData["element:create"]) => void,
  _onUpdate: (data: SocketEventData["element:update"]) => void,
  _onDelete: (data: SocketEventData["element:delete"]) => void,
) {}
