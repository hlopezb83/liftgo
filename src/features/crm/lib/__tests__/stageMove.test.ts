import { describe, expect, it } from "vitest";
import { applyStageMove } from "../stageMove";
import type { Prospect } from "../prospectTypes";

function p(id: string, stage: string, stageOrder: number): Prospect {
  return {
    id,
    companyName: id,
    contactPerson: null,
    email: null,
    phone: null,
    dealValue: 0,
    dealValueLabel: "$0.00",
    stage,
    stageOrder,
    notes: null,
    quoteId: null,
    customerId: null,
    createdBy: null,
    createdByName: null,
    createdAt: "2026-01-01",
    createdAtLabel: "01/01/2026",
    updatedAt: "2026-01-01",
    staleDays: 0,
    isStale: false,
    isClosed: false,
    closedAt: null,
    closedAtLabel: null,
    lostReason: null,
    finalAmount: null,
  };
}

describe("applyStageMove", () => {
  const base = [
    p("a", "nuevo_prospecto", 0),
    p("b", "nuevo_prospecto", 1),
    p("c", "contactado", 0),
  ];

  it("mueve la tarjeta a la columna destino en el índice indicado", () => {
    const next = applyStageMove(base, { id: "a", newStage: "contactado", newIndex: 0 });
    const moved = next.find((x) => x.id === "a");
    expect(moved?.stage).toBe("contactado");
    expect(moved?.stageOrder).toBe(0);
    expect(next.find((x) => x.id === "c")?.stageOrder).toBe(1);
  });

  it("recompacta el orden de la columna origen", () => {
    const next = applyStageMove(base, { id: "a", newStage: "contactado", newIndex: 1 });
    expect(next.find((x) => x.id === "b")?.stageOrder).toBe(0);
    expect(next.find((x) => x.id === "a")?.stageOrder).toBe(1);
  });

  it("acota índices fuera de rango al final de la columna", () => {
    const next = applyStageMove(base, { id: "b", newStage: "contactado", newIndex: 99 });
    expect(next.find((x) => x.id === "b")?.stageOrder).toBe(1);
  });

  it("no cambia nada si el prospecto no existe", () => {
    expect(applyStageMove(base, { id: "zz", newStage: "contactado", newIndex: 0 })).toBe(base);
  });
});
