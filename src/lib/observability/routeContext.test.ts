import { describe, expect, it } from "vitest";
import { deriveFlow, sanitizeRoute } from "./routeContext";

describe("sanitizeRoute", () => {
  it("preserva root", () => {
    expect(sanitizeRoute("/")).toBe("/");
  });

  it("reemplaza UUID por :id", () => {
    expect(sanitizeRoute("/facturas/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/editar"))
      .toBe("/facturas/:id/editar");
  });

  it("reemplaza IDs numéricos por :id", () => {
    expect(sanitizeRoute("/reservas/12345")).toBe("/reservas/:id");
  });

  it("reemplaza folios de negocio por :folio", () => {
    expect(sanitizeRoute("/facturas/FAC-0094")).toBe("/facturas/:folio");
    expect(sanitizeRoute("/cotizaciones/COT-0001/pdf")).toBe("/cotizaciones/:folio/pdf");
    expect(sanitizeRoute("/borradores/BORRADOR-0022")).toBe("/borradores/:folio");
  });

  it("preserva palabras clave del ERP", () => {
    expect(sanitizeRoute("/mantenimiento/kanban")).toBe("/mantenimiento/kanban");
  });
});

describe("deriveFlow", () => {
  it("devuelve el primer segmento", () => {
    expect(deriveFlow("/facturas/FAC-0094")).toBe("facturas");
    expect(deriveFlow("/mantenimiento/kanban")).toBe("mantenimiento");
  });

  it("colapsa root", () => {
    expect(deriveFlow("/")).toBe("root");
    expect(deriveFlow("")).toBe("root");
  });

  it("no expone IDs como flow", () => {
    expect(deriveFlow("/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).toBe("root");
    expect(deriveFlow("/12345")).toBe("root");
  });
});
