import { describe, expect, it } from "vitest";
import type { ShapeElement } from "@giga-pdf/types";
import { buildTableElements } from "./table-layout";

describe("buildTableElements", () => {
  it("creates cell text and vertical as well as horizontal grid lines", () => {
    const elements = buildTableElements({
      rows: 2,
      cols: 3,
      area: { x: 20, y: 30, width: 300, height: 120 },
    });
    const lines = elements.filter(
      (element) => "shapeType" in element && element.shapeType === "line",
    ) as ShapeElement[];
    const textCells = elements.filter((element) => element.type === "text");

    expect(textCells).toHaveLength(6);
    expect(lines).toHaveLength(7);
    expect(
      lines.filter(
        (line) =>
          "geometry" in line &&
          line.geometry.points[0]?.x === line.geometry.points[1]?.x,
      ),
    ).toHaveLength(4);
  });
});
