import { describe, expect, it } from "vitest";
import { SerialRenderQueue } from "./serial-render-queue";

describe("page/font rendering", () => {
  it("waits for the background before replacing the text overlay", async () => {
    const queue = new SerialRenderQueue();
    let finishBackground!: () => void;
    const background = new Promise<void>((resolve) => { finishBackground = resolve; });
    const objects: string[] = [];
    const load = queue.run(async () => {
      objects.length = 0;
      await background;
      objects.push("background", "text");
    });
    const fonts = queue.run(async () => {
      objects.splice(1);
      objects.push("text");
    });
    await Promise.resolve();
    expect(objects).toEqual([]);
    finishBackground();
    await Promise.all([load, fonts]);
    expect(objects).toEqual(["background", "text"]);
  });

  it("continues rendering after a failed page load", async () => {
    const queue = new SerialRenderQueue();
    await expect(queue.run(async () => { throw new Error("background unavailable"); })).rejects.toThrow();
    await expect(queue.run(async () => "next page")).resolves.toBe("next page");
  });
});
