import { describe, expect, it } from "vitest";
import { stripOrganizationId } from "../writeContext";

/**
 * Tramo 4 · la empresa nunca viaja en un payload del navegador.
 * El trigger `enforce_organization_write_context` sigue siendo la defensa real;
 * esto sólo garantiza que la UI no proponga una organización.
 */
describe("stripOrganizationId", () => {
  it("elimina organization_id del payload", () => {
    const payload = { company_name: "Prospecto", organization_id: "org-b" };
    expect(stripOrganizationId(payload)).toEqual({ company_name: "Prospecto" });
  });

  it("no muta el objeto original", () => {
    const payload = { company_name: "Prospecto", organization_id: "org-b" };
    stripOrganizationId(payload);
    expect(payload.organization_id).toBe("org-b");
  });

  it("conserva el resto de las claves, incluidos nulos y falsos", () => {
    const payload = {
      notes: null,
      is_active: false,
      deal_value: 0,
      organization_id: null,
    };
    expect(stripOrganizationId(payload)).toEqual({
      notes: null,
      is_active: false,
      deal_value: 0,
    });
  });

  it("devuelve el payload tal cual cuando no trae organización", () => {
    const payload = { company_name: "Prospecto" };
    expect(stripOrganizationId(payload)).toEqual(payload);
  });
});
