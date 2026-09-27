import type { ShapeElement } from "@giga-pdf/types";

export type ShapeLineEndpoints = [number, number, number, number];

export function shapeLineEndpoints(
  element: Pick<ShapeElement, "bounds" | "geometry">,
): ShapeLineEndpoints {
  const [start, end] = element.geometry?.points ?? [];
  return [
    start?.x ?? element.bounds.x,
    start?.y ?? element.bounds.y,
    end?.x ?? element.bounds.x + element.bounds.width,
    end?.y ?? element.bounds.y + element.bounds.height,
  ];
}
