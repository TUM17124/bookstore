import { describe, expect, it } from "vitest";
import { shapeLineEndpoints } from "./shape-line-geometry";

describe("shapeLineEndpoints", () => {
  it("preserves vertical line endpoints instead of treating every line as horizontal", () => {
    expect(
      shapeLineEndpoints({
        bounds: { x: 120, y: 40, width: 1, height: 180 },
        geometry: {
          points: [
            { x: 120, y: 40 },
            { x: 120, y: 220 },
          ],
          pathData: null,
          cornerRadius: 0,
        },
      }),
    ).toEqual([120, 40, 120, 220]);
  });

  it("uses the bounds diagonal when endpoint geometry is missing", () => {
    expect(
      shapeLineEndpoints({
        bounds: { x: 15, y: 25, width: 80, height: 60 },
        geometry: { points: [], pathData: null, cornerRadius: 0 },
      }),
    ).toEqual([15, 25, 95, 85]);
  });
});
