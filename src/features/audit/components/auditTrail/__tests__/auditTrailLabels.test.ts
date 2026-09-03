import { describe, it, expect } from "vitest";
import { translateField, translateAction, translateTable, HIDDEN_DIFF_FIELDS, TABLES } from "../auditTrailLabels";

describe("auditTrailLabels", () => {
  it("traduce campos conocidos al español", () => {
    expect(translateField("status")).toBe("Estado");
    expect(translateField("daily_rate")).toBe("Tarifa Diaria");
    expect(translateField("customer_name")).toBe("Nombre del Cliente");
  });

  it("fallback: convierte snake_case a texto legible con mayúscula inicial", () => {
    expect(translateField("foo_bar_baz")).toBe("Foo bar baz");
  });

  it("Hallazgo 8 · traduce los campos técnicos que aparecían crudos", () => {
    expect(translateField("cfdi_xml")).toBe("XML del CFDI");
    expect(translateField("stamp_variance_checked_at")).toBe("Variación Verificada el");
    expect(translateField("accepted_by_user_id")).toBe("Aceptado por");
    expect(translateField("sat_validation_status")).toBe("Validación SAT");
    expect(translateField("rep_cfdi_uuid")).toBe("UUID del REP");
  });

  it("traduce acciones INSERT/UPDATE/DELETE", () => {
    expect(translateAction("INSERT")).toBe("Creación");
    expect(translateAction("UPDATE")).toBe("Actualización");
    expect(translateAction("DELETE")).toBe("Eliminación");
    expect(translateAction("OTHER")).toBe("OTHER");
  });

  it("traduce nombres de tablas", () => {
    expect(translateTable("bookings")).toBe("Reservas");
    expect(translateTable("invoices")).toBe("Facturas");
    expect(translateTable("custom_table")).toBe("custom table");
  });

  it("HIDDEN_DIFF_FIELDS contiene los campos del sistema", () => {
    expect(HIDDEN_DIFF_FIELDS.has("updated_at")).toBe(true);
    expect(HIDDEN_DIFF_FIELDS.has("stage_order")).toBe(true);
    expect(HIDDEN_DIFF_FIELDS.has("search_vector")).toBe(true);
    expect(HIDDEN_DIFF_FIELDS.has("status")).toBe(false);
  });

  it("BL-R8-16 · traduce la tabla profiles", () => {
    expect(translateTable("profiles")).toBe("Perfiles de Usuario");
    expect(TABLES.some((t) => t.value === "profiles" && t.label === "Perfiles de Usuario")).toBe(true);
  });

  it("BL-R8-16 · traduce los campos role, full_name y avatar_url", () => {
    expect(translateField("role")).toBe("Rol");
    expect(translateField("full_name")).toBe("Nombre Completo");
    expect(translateField("avatar_url")).toBe("Foto de Perfil");
  });
});
