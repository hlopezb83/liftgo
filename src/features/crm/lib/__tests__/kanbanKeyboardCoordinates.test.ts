import { describe, it, expect } from "vitest";
import type { ClientRect } from "@dnd-kit/core";
import {
  pickSiblingColumn,
  columnDropCoordinates,
  type ColumnRect,
} from "../kanbanKeyboardCoordinates";

function rect(left: number, top = 100, width = 260, height = 400): ClientRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

const columns: ColumnRect[] = [
  { id: "nuevo_prospecto", rect: rect(0) },
  { id: "contactado", rect: rect(280) },
  { id: "cotizacion_enviada", rect: rect(560) },
];

describe("pickSiblingColumn", () => {
  it("devuelve la columna de la derecha", () => {
    expect(pickSiblingColumn(columns, 8, 1)?.id).toBe("contactado");
  });

  it("devuelve la columna de la izquierda", () => {
    expect(pickSiblingColumn(columns, 288, -1)?.id).toBe("nuevo_prospecto");
  });

  it("no sale del rango en los extremos", () => {
    expect(pickSiblingColumn(columns, 568, 1)).toBeNull();
    expect(pickSiblingColumn(columns, 8, -1)).toBeNull();
  });

  it("ordena por posición aunque lleguen desordenadas", () => {
    const shuffled = [columns[2], columns[0], columns[1]];
    expect(pickSiblingColumn(shuffled, 8, 1)?.id).toBe("contactado");
  });

  it("es tolerante con listas vacías", () => {
    expect(pickSiblingColumn([], 0, 1)).toBeNull();
  });
});

describe("columnDropCoordinates", () => {
  it("apunta al interior de la columna (padding de 8px)", () => {
    expect(columnDropCoordinates(rect(280, 120))).toEqual({ x: 288, y: 128 });
  });
});
