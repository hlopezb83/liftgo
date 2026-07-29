import { describe, it, expect } from "vitest";
import { resolveDropTarget } from "../resolveDropTarget";
import type { DragEndEvent } from "@dnd-kit/core";

const columns = [
  { key: "nuevo_prospecto", items: [{ id: "a" }, { id: "b" }] },
  { key: "contactado", items: [{ id: "c" }] },
];

function event(active: Record<string, unknown>, over: Record<string, unknown> | null): DragEndEvent {
  return {
    active: { id: String(active.id), data: { current: active } },
    over: over ? { id: String(over.id), data: { current: over } } : null,
  } as unknown as DragEndEvent;
}

describe("resolveDropTarget (R23-I)", () => {
  it("usa el índice del sortable cuando se suelta sobre otra tarjeta", () => {
    const target = resolveDropTarget(
      event(
        { id: "a", stage: "nuevo_prospecto" },
        { id: "c", type: "card", stage: "contactado", sortable: { index: 0 } },
      ),
      columns,
    );
    expect(target).toEqual({
      draggableId: "a",
      sourceStage: "nuevo_prospecto",
      newStage: "contactado",
      newIndex: 0,
    });
  });

  it("soltar en el área vacía de otra columna manda al FINAL", () => {
    const target = resolveDropTarget(
      event({ id: "a", stage: "nuevo_prospecto" }, { id: "contactado", type: "column" }),
      columns,
    );
    expect(target?.newIndex).toBe(1);
  });

  it("soltar en el área vacía de la misma columna manda al último hueco", () => {
    const target = resolveDropTarget(
      event({ id: "a", stage: "nuevo_prospecto" }, { id: "nuevo_prospecto", type: "column" }),
      columns,
    );
    expect(target?.newIndex).toBe(1);
  });

  it("devuelve null sin destino o sin columna de origen", () => {
    expect(resolveDropTarget(event({ id: "a", stage: "x" }, null), columns)).toBeNull();
    expect(
      resolveDropTarget(event({ id: "a" }, { id: "contactado", type: "column" }), columns),
    ).toBeNull();
  });

  it("una columna desconocida cae en índice 0", () => {
    const target = resolveDropTarget(
      event({ id: "a", stage: "nuevo_prospecto" }, { id: "otra", type: "column" }),
      columns,
    );
    expect(target?.newIndex).toBe(0);
  });
});
