export interface BakedElement { element_id: string; revision: string }
const bakedByBlob = new WeakMap<Blob, BakedElement[]>();
export function bakedElements(blob: Blob): BakedElement[] { return bakedByBlob.get(blob) ?? []; }
export function rememberBakedElements(blob: Blob, entries: BakedElement[]): void {
  const unique = new Map(entries.map(entry => [`${entry.element_id}:${entry.revision}`, entry]));
  bakedByBlob.set(blob, [...unique.values()]);
}
/** Serialize binary mutations; a failed operation does not poison later work. */
export function serialExecutor() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
