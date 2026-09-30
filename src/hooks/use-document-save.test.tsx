// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@giga-pdf/logger", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { useLogger: () => logger, createDefaultLogger: () => logger };
});
vi.mock("@/lib/pdf-editor/api", () => ({ api: { createDocumentVersion: vi.fn(), saveDocument: vi.fn() } }));
import { api } from "@/lib/pdf-editor/api";
import { offlineQueue } from "@/lib/pdf-editor/offline-queue";
import { useDocumentSave, type UseDocumentSaveReturn } from "./use-document-save";

let root: Root;
let state: UseDocumentSaveReturn;
let markDirty: (value: boolean) => void;
const prepare = vi.fn(async () => new Blob(["edited PDF"], { type: "application/pdf" }));
function Harness() {
  const [dirty, setDirty] = useState(true);
  markDirty = setDirty;
  state = useDocumentSave({ documentId: "session-a", storedDocumentId: "stored-a", name: "Book", isDirty: dirty, setDirty, getPreparedBlob: prepare, autoSaveInterval: 0 });
  return null;
}
async function mount() {
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => { root.render(<Harness />); });
}
function leaveBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  await offlineQueue.clear();
  vi.mocked(api.createDocumentVersion).mockReset();
  vi.mocked(api.createDocumentVersion).mockResolvedValue({ stored_document_id: "stored-a" } as Awaited<ReturnType<typeof api.createDocumentVersion>>);
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  document.body.replaceChildren();
  await offlineQueue.clear();
});

describe("saved document leave warning", () => {
  it("preserves a separate Save As request", async () => {
    await offlineQueue.enqueue({ type: "save_document", payload: { documentId: "session-a", storedDocumentId: "stored-a", forceNewDocument: true } });
    await mount();
    await act(async () => { await state.save(); });
    expect(state.offlineQueueSize).toBe(1);
    expect(leaveBlocked()).toBe(true);
  });

  it("clears a failed-save retry after a successful manual save", async () => {
    await mount();
    vi.mocked(api.createDocumentVersion).mockRejectedValueOnce(new Error("upload interrupted"));
    await act(async () => { expect(await state.save()).toBe(false); });
    expect(state.offlineQueueSize).toBe(1);
    expect(leaveBlocked()).toBe(true);
    await act(async () => { expect(await state.save()).toBe(true); });
    expect(state.offlineQueueSize).toBe(0);
    expect(await offlineQueue.size()).toBe(0);
    expect(state.pendingChanges).toBe(0);
    expect(leaveBlocked()).toBe(false);
  });

  it("preserves another document's retry without warning on this saved document", async () => {
    await offlineQueue.enqueue({ type: "save_document", payload: { documentId: "session-b", storedDocumentId: "stored-b" } });
    await mount();
    await act(async () => { await state.save(); });
    expect(state.offlineQueueSize).toBe(0);
    expect(await offlineQueue.size()).toBe(1);
    expect(leaveBlocked()).toBe(false);
  });

  it("keeps edits made during upload dirty", async () => {
    await mount();
    let complete!: (value: Awaited<ReturnType<typeof api.createDocumentVersion>>) => void;
    vi.mocked(api.createDocumentVersion).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    let saving!: Promise<boolean>;
    await act(async () => { saving = state.save(); });
    await act(async () => { markDirty(true); state.saveWithPriority("auto"); });
    await act(async () => { complete({ stored_document_id: "stored-a" } as Awaited<ReturnType<typeof api.createDocumentVersion>>); await saving; });
    expect(state.pendingChanges).toBe(1);
    expect(leaveBlocked()).toBe(true);
  });

  it("does not acknowledge a newer queued snapshot", async () => {
    await mount();
    let complete!: (value: Awaited<ReturnType<typeof api.createDocumentVersion>>) => void;
    vi.mocked(api.createDocumentVersion).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    let saving!: Promise<boolean>;
    await act(async () => { saving = state.save(); });
    await offlineQueue.enqueue({ type: "save_document", payload: { documentId: "session-a", storedDocumentId: "stored-a", file: new Blob(["newer"]) } });
    await act(async () => { complete({ stored_document_id: "stored-a" } as Awaited<ReturnType<typeof api.createDocumentVersion>>); await saving; });
    expect(state.offlineQueueSize).toBe(1);
    expect(leaveBlocked()).toBe(true);
  });
});
