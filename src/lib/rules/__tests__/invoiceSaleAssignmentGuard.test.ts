import { describe, expect, it } from "vitest";

import { describeBusinessBlock, resolveBusinessBlock } from "../businessBlocks";

/**
 * Guard P1-B: `trg_guard_invoice_sale_assignment` rechaza el alta de una
 * factura ligada a una cotización de venta con equipos sin asignar. La UI ya
 * previene el caso (SaleAssignmentBlocked); esta prueba sólo cubre el mapeo del
 * rechazo del backend (carrera / estado obsoleto) al bloqueo explicable.
 */
describe("bloqueo: cotización de venta sin asignación completa", () => {
  it("mapea el mensaje del guard al bloqueo canónico", () => {
    const block = resolveBusinessBlock({
      code: "P0001",
      message: "No se puede facturar: la cotización de venta tiene 2 equipo(s) sin asignar",
    });
    expect(block?.code).toBe("quote_sale_assignment_incomplete");
  });

  it("usa una sola copia canónica en español", () => {
    const block = describeBusinessBlock("quote_sale_assignment_incomplete");
    expect(block.action).toMatch(/No puedes facturar/i);
    expect(block.reason).toMatch(/asignar/i);
    expect(block.nextStep).toMatch(/cotización/i);
    expect(block.tone).toBe("info");
  });

  it("no confunde otros errores de facturación", () => {
    expect(
      resolveBusinessBlock({ code: "P0001", message: "Las partidas no cuadran con el subtotal" }),
    ).toBeNull();
  });
});
