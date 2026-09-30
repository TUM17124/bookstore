/** Keep asynchronous page/font rebuilds from painting over each other. */
export class SerialRenderQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(render: () => Promise<T>): Promise<T> {
    const result = this.tail.then(render);
    // A failed background must not block the next page or font refresh.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
