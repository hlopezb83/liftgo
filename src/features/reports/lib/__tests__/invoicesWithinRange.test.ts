import { describe, it, expect } from "vitest";
import { invoicesWithinRange, type DrilldownInvoice } from "../drilldown";

const inv = (id: string, issued_at: string): DrilldownInvoice => ({
  id,
  invoice_number: id,
  issued_at,
  total: 100,
  status: "sent",
});

describe("V27-01 · detalle mensual recortado al rango del reporte", () => {
  const junio = [
    inv("A", "2026-06-01"),
    inv("B", "2026-06-01"),
    inv("C", "2026-06-08"),
    inv("D", "2026-06-20"),
    inv("E", "2026-06-30"),
  ];

  it("mes inicial parcial: excluye el 1 de junio y deja las del rango", () => {
    const r = invoicesWithinRange(junio, new Date(2026, 5, 8), new Date(2026, 8, 8));
    expect(r.map((i) => i.id)).toEqual(["C", "D", "E"]);
    expect(r).toHaveLength(3);
  });

  it("incluye las fechas exactamente en ambos límites (inclusivo)", () => {
    const r = invoicesWithinRange(junio, new Date(2026, 5, 8), new Date(2026, 5, 30));
    expect(r.map((i) => i.id)).toEqual(["C", "D", "E"]);
  });

  it("mes final parcial: corta después del fin de rango", () => {
    const r = invoicesWithinRange(junio, new Date(2026, 5, 1), new Date(2026, 5, 8));
    expect(r.map((i) => i.id)).toEqual(["A", "B", "C"]);
  });

  it("rango de un solo día", () => {
    const r = invoicesWithinRange(junio, new Date(2026, 5, 20), new Date(2026, 5, 20));
    expect(r.map((i) => i.id)).toEqual(["D"]);
  });

  it("mes completo: no descarta nada", () => {
    const r = invoicesWithinRange(junio, new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(r).toHaveLength(5);
  });

  it("no se desplaza por UTC con timestamps de fin de día", () => {
    const r = invoicesWithinRange(
      [inv("F", "2026-06-30T23:30:00-06:00")],
      new Date(2026, 5, 1),
      new Date(2026, 5, 30),
    );
    expect(r).toHaveLength(1);
  });
});
