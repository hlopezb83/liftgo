import { describe, expect, it } from "vitest";

import * as facade from "../pgErrorCatalog";
import * as data from "../pgErrorCatalog.data";

describe("pgErrorCatalog — contrato de la fachada", () => {
  it("exporta exactamente la API pública previa", () => {
    expect(Object.keys(facade).sort()).toEqual(
      ["CONSTRAINT_MESSAGES", "SQLSTATE_MESSAGES", "translatePgError"].sort(),
    );
    expect(typeof facade.translatePgError).toBe("function");
  });

  it("reexporta los mapas estáticos desde el módulo de datos", () => {
    expect(facade.CONSTRAINT_MESSAGES).toBe(data.CONSTRAINT_MESSAGES);
    expect(facade.SQLSTATE_MESSAGES).toBe(data.SQLSTATE_MESSAGES);
    expect(facade.CONSTRAINT_MESSAGES.suppliers_rfc_unique_idx.message).toMatch(/RFC de proveedor/i);
  });

  it("resuelve por nombre de restricción (nivel 1)", () => {
    const r = facade.translatePgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "customers_rfc_unique"',
    });
    expect(r.matched).toBe(true);
    expect(r.constraint).toBe("customers_rfc_unique");
    expect(r.severity).toBe("warning");
  });

  it("resuelve por patrón prioritario antes que el SQLSTATE genérico", () => {
    const r = facade.translatePgError({
      code: "23514",
      message: "new row violates check constraint invoices_booking_period_required",
    });
    expect(r.title).toBe("Falta el periodo de facturación");
    expect(r.sqlstate).toBeUndefined();
  });

  it("resuelve por SQLSTATE cuando no hay restricción ni patrón prioritario", () => {
    const r = facade.translatePgError({ code: "23503", message: "violates foreign key constraint" });
    expect(r.sqlstate).toBe("23503");
    expect(r.matched).toBe(true);
  });

  it("devuelve fallback con matched:false cuando nada coincide", () => {
    const r = facade.translatePgError({ message: "algo inédito" }, "Error al guardar");
    expect(r.matched).toBe(false);
    expect(r.title).toBe("Error al guardar");
    expect(r.severity).toBe("critical");
    expect(r.message).toBe("algo inédito");
  });
});
